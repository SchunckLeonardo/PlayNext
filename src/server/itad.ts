import type {
  Country,
  Money,
  PriceSnapshot,
  StoreKey,
  StorePrice,
} from "../lib/types";
import { record } from "../lib/types";
import {
  emptySnapshot,
  ITAD_SHOPS,
  ITAD_WINDOW_MS,
  ITAD_SAFE_UPSTREAM_BUDGET,
  STORE_KEYS,
  safeStoreUrl,
} from "../lib/prices";
import { MemoryPriceStore, type PriceStore } from "./price-store";

export interface PriceQuery {
  title: string;
  country: Country;
  released?: string;
  steamAppId?: number;
}
export class PriceError extends Error {
  constructor(
    message: string,
    public status = 502,
    public retryAfter = 30,
  ) {
    super(message);
  }
}
const canonical = (title: string) =>
  title
    .toLocaleLowerCase("en-US")
    .replace(/[™®©]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
function money(value: unknown, currency: Money["currency"]): Money | null {
  const data = record(value);
  return typeof data.amount === "number" &&
    Number.isFinite(data.amount) &&
    data.amount >= 0 &&
    data.currency === currency
    ? { amount: data.amount, currency }
    : null;
}
export function normalizeItadPrices(
  raw: unknown,
  id: string,
  country: Country,
  now: number,
): PriceSnapshot {
  const result = emptySnapshot(country, "not-found", now);
  const row = record(
    Array.isArray(raw) ? raw.find((item) => record(item).id === id) : null,
  );
  const currency = result.currency;
  for (const rawDeal of Array.isArray(row.deals) ? row.deals : []) {
    const deal = record(rawDeal),
      shop = record(deal.shop);
    const key = STORE_KEYS.find((k) => ITAD_SHOPS[k].id === shop.id);
    const price = money(deal.price, currency),
      regular = money(deal.regular, currency),
      url = safeStoreUrl(deal.url);
    if (!key || !price || !url) continue;
    const offer: StorePrice = {
      ...price,
      regular: regular?.amount ?? price.amount,
      cut:
        typeof deal.cut === "number"
          ? Math.max(0, Math.min(100, Math.round(deal.cut)))
          : 0,
      url,
    };
    if (!result.stores[key] || offer.amount < result.stores[key]!.amount)
      result.stores[key] = offer;
  }
  result.itadId = id;
  result.bestStore = STORE_KEYS.reduce<StoreKey | null>(
    (best, key) =>
      result.stores[key] &&
      (!best || result.stores[key]!.amount < result.stores[best]!.amount)
        ? key
        : best,
    null,
  );
  result.found = result.bestStore !== null;
  result.status = result.found ? "available" : "not-found";
  // Only the explicit all-time value is a historical low; current, 1y and 3m lows are not.
  result.historyLow = money(record(row.historyLow).all, currency);
  result.expiresAt = now + (result.found ? 15 * 60_000 : 5 * 60_000);
  return result;
}
export class ItadPriceService {
  private pending = new Map<string, Promise<PriceSnapshot>>();
  constructor(
    private options: {
      apiKey: string;
      request?: typeof fetch;
      store?: PriceStore;
      now?: () => number;
    },
  ) {}
  private get store() {
    return (
      this.options.store ??
      (this.options.store = new MemoryPriceStore(this.options.now))
    );
  }
  private now() {
    return (this.options.now ?? Date.now)();
  }
  private async call(
    path: string,
    params: Record<string, string>,
    body?: string[],
  ): Promise<unknown> {
    if (
      !(await this.store.take(
        "itad:global",
        ITAD_SAFE_UPSTREAM_BUDGET,
        ITAD_WINDOW_MS,
      ))
    )
      throw new PriceError(
        "Price request limit reached. Try again shortly.",
        429,
        300,
      );
    const url = new URL(path, "https://api.isthereanydeal.com/");
    url.search = new URLSearchParams(params).toString();
    try {
      const res = await (this.options.request ?? fetch)(url, {
        method: body ? "POST" : "GET",
        headers: {
          "ITAD-API-Key": this.options.apiKey,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      });
      if (res.status === 429)
        throw new PriceError(
          "Price provider request limit reached.",
          429,
          Math.min(
            300,
            Math.max(5, Number(res.headers.get("retry-after")) || 30),
          ),
        );
      if (!res.ok)
        throw new PriceError(
          "The price provider is unavailable. Try again later.",
        );
      return await res.json();
    } catch (error) {
      if (error instanceof PriceError) throw error;
      throw new PriceError(
        "Could not reach the price provider. Try again later.",
      );
    }
  }
  private async resolveId(query: PriceQuery): Promise<string | null> {
    const identityKey = `identity:v3:${query.steamAppId || `${query.title}:${query.released || ""}`}`;
    const cached = await this.store.get<{ id: string | null }>(identityKey);
    if (cached) return cached.id;
    let lookup = record(
      await this.call(
        "games/lookup/v1",
        query.steamAppId
          ? { appid: String(query.steamAppId) }
          : { title: query.title },
      ),
    );
    const yearSuffix = query.title.match(/\s*\(((?:19|20)\d{2})\)\s*$/);
    if (!lookup.found && yearSuffix && !query.steamAppId)
      lookup = record(
        await this.call("games/lookup/v1", {
          title: query.title.replace(/\s*\((?:19|20)\d{2}\)\s*$/, ""),
        }),
      );
    const candidate = record(lookup.game);
    let id: string | null =
      lookup.found &&
      typeof candidate.id === "string" &&
      /^[0-9a-f-]{36}$/i.test(candidate.id)
        ? candidate.id
        : null;
    if (id) {
      const info = record(await this.call("games/info/v2", { id }));
      const expectedYear = yearSuffix?.[1] || query.released?.slice(0, 4);
      const sameName =
        typeof info.title === "string" &&
        canonical(info.title) ===
          canonical(
            yearSuffix
              ? query.title.replace(/\s*\((?:19|20)\d{2}\)\s*$/, "")
              : query.title,
          );
      const sameYear =
        expectedYear &&
        typeof info.releaseDate === "string" &&
        info.releaseDate.slice(0, 4) === expectedYear;
      if (
        info.id !== id ||
        (info.type && info.type !== "game") ||
        (query.steamAppId
          ? info.appid !== query.steamAppId
          : !sameName || !sameYear)
      )
        id = null;
    }
    await this.store.set(identityKey, { id }, id ? 7 * 86400_000 : 5 * 60_000);
    return id;
  }
  async getPrices(
    query: PriceQuery,
    clientId = "anonymous",
  ): Promise<PriceSnapshot> {
    if (!this.options.apiKey)
      throw new PriceError(
        "Store prices are not configured on this server.",
        503,
      );
    if (
      !(await this.store.take(`client:${clientId}:burst`, 6, 10_000)) ||
      !(await this.store.take(`client:${clientId}:window`, 25, ITAD_WINDOW_MS))
    )
      throw new PriceError("Too many price requests. Try again shortly.", 429);
    const key = `price:v3:${query.steamAppId || `${query.title}:${query.released || ""}`}:${query.country}`;
    const cached = await this.store.get<PriceSnapshot>(key);
    if (cached && cached.expiresAt > this.now()) return cached;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const task = (async () => {
      const id = await this.resolveId(query);
      const result = id
        ? normalizeItadPrices(
            await this.call(
              "games/prices/v3",
              {
                country: query.country,
                shops: STORE_KEYS.map((k) => ITAD_SHOPS[k].id).join(","),
              },
              [id],
            ),
            id,
            query.country,
            this.now(),
          )
        : emptySnapshot(query.country, "not-found", this.now());
      await this.store.set(key, result, result.expiresAt - this.now());
      return result;
    })();
    this.pending.set(key, task);
    try {
      return await task;
    } finally {
      this.pending.delete(key);
    }
  }
}
