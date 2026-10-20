import { record } from "./types";
import type { Locale } from "./preferences";
import type { Country, Game, Money, PriceSnapshot, StoreKey } from "./types";
export const CLIENT_HEADER_NAME = "x-playnext-client";
export const CLIENT_HEADER_VALUE = "playnext-web/3";
export const PROOF_HEADER_NAME = "x-playnext-proof";
export const ITAD_WINDOW_MS = 300_000;
export const ITAD_SAFE_UPSTREAM_BUDGET = 80;
export const ITAD_SHOPS = {
  steam: { id: 61, label: "Steam", shortLabel: "Steam" },
  gog: { id: 35, label: "GOG", shortLabel: "GOG" },
  epic: { id: 16, label: "Epic Games", shortLabel: "Epic" },
} as const;
export const STORE_KEYS: StoreKey[] = ["steam", "gog", "epic"];
export function normalizeCountry(value: string): Country {
  if (value !== "US" && value !== "BR") throw new Error("Choose US or BR.");
  return value;
}
export function formatPrice(
  amount: number,
  currency: Money["currency"],
  locale?: Locale,
) {
  return amount === 0
    ? locale === "pt-BR"
      ? "Grátis"
      : "Free"
    : new Intl.NumberFormat(
        locale || (currency === "BRL" ? "pt-BR" : "en-US"),
        {
          style: "currency",
          currency,
        },
      ).format(amount);
}
export function safeStoreUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      [
        "store.steampowered.com",
        "gog.com",
        "www.gog.com",
        "store.epicgames.com",
        "itad.link",
        "isthereanydeal.com",
      ].includes(url.hostname)
      ? url.href
      : "";
  } catch {
    return "";
  }
}
export function fallbackStoreLinks(title: string): Record<StoreKey, string> {
  return {
    steam: `https://store.steampowered.com/search/?term=${encodeURIComponent(title)}`,
    gog: `https://www.gog.com/en/games?query=${encodeURIComponent(title)}`,
    epic: `https://store.epicgames.com/en-US/browse?q=${encodeURIComponent(title)}`,
  };
}
export function computeBotProof(
  title: string,
  country: Country,
  minute: number,
): string {
  let hash = 2166136261;
  for (const char of `playnext:${title.trim()}:${country}:${minute}`)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}
export function emptySnapshot(
  country: Country,
  status: PriceSnapshot["status"],
  now = Date.now(),
): PriceSnapshot {
  return {
    found: false,
    status,
    source: "itad",
    country,
    currency: country === "BR" ? "BRL" : "USD",
    itadId: null,
    bestStore: null,
    stores: { steam: null, gog: null, epic: null },
    historyLow: null,
    fetchedAt: new Date(now).toISOString(),
    expiresAt: now + (status === "not-found" ? 300_000 : 15_000),
  };
}
export class PriceClient {
  private cache = new Map<string, PriceSnapshot>();
  private cooldownUntil = 0;
  constructor(
    private request: typeof fetch = (...args) => globalThis.fetch(...args),
    private now = Date.now,
  ) {}
  async forGame(
    game: Game,
    country: Country,
    signal?: AbortSignal,
  ): Promise<PriceSnapshot> {
    if (game.platforms.length && !game.platforms.includes("pc"))
      return emptySnapshot(country, "console-only", this.now());
    const key = `${game.id}:${game.steamAppId || ""}:${country}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > this.now()) return cached;
    if (this.cooldownUntil > this.now())
      return emptySnapshot(country, "rate-limited", this.now());
    const params = new URLSearchParams({
      title: game.name,
      country,
      released: game.released || "",
    });
    if (game.steamAppId) params.set("steamAppId", String(game.steamAppId));
    try {
      const res = await this.request(`/api/prices?${params}`, {
        signal,
        headers: {
          [CLIENT_HEADER_NAME]: CLIENT_HEADER_VALUE,
          [PROOF_HEADER_NAME]: computeBotProof(
            game.name,
            country,
            Math.floor(this.now() / 60000),
          ),
        },
      });
      if (!res.ok) {
        const body = record(await res.json().catch(() => null));
        if (res.status === 429)
          this.cooldownUntil =
            this.now() +
            Math.max(
              5,
              Math.min(300, Number(res.headers.get("retry-after")) || 30),
            ) *
              1000;
        return emptySnapshot(
          country,
          res.status === 429
            ? "rate-limited"
            : body.status === "unconfigured"
              ? "unconfigured"
              : "unavailable",
          this.now(),
        );
      }
      const data: PriceSnapshot = await res.json();
      if (this.cache.size >= 200)
        this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, data);
      return data;
    } catch (error) {
      if (signal?.aborted) throw error;
      return emptySnapshot(country, "unavailable", this.now());
    }
  }
}
