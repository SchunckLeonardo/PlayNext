import type { Choice, Game } from "./types";
import { record } from "./types";
import { normalizeGame, shuffle, unseenGames } from "./model";

const BASE = "https://api.rawg.io/api/";
export class RawgError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}
export class RawgClient {
  key: string;
  request: typeof fetch;
  random: () => number;
  constructor(
    key: string,
    request: typeof fetch = (...args) => globalThis.fetch(...args),
    random = Math.random,
  ) {
    this.key = key.trim();
    this.request = request;
    this.random = random;
  }
  async get(
    path: string,
    params: Record<string, string | number> = {},
    signal?: AbortSignal,
  ) {
    const url = new URL(path, BASE);
    url.search = new URLSearchParams(
      Object.fromEntries(
        Object.entries({ ...params, key: this.key }).map(([k, v]) => [
          k,
          String(v),
        ]),
      ),
    ).toString();
    let response;
    try {
      response = await this.request(url.href, {
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(18000)])
          : AbortSignal.timeout(18000),
        referrerPolicy: "no-referrer",
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new RawgError(
        "Could not reach RAWG. Check your API key and connection, then try again.",
      );
    }
    if (!response.ok) {
      if ([401, 403].includes(response.status))
        throw new RawgError(
          "RAWG rejected this key. Check your API key and try again.",
          response.status,
        );
      if (response.status === 429)
        throw new RawgError(
          "RAWG request limit reached. Wait a moment and try again.",
          429,
        );
      throw new RawgError(
        "RAWG is currently unavailable. Try again in a moment.",
        response.status,
      );
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw new RawgError("RAWG returned an unexpected response. Try again.");
    }
    return record(data);
  }
  async catalog(path: string, signal?: AbortSignal) {
    const results = [];
    for (let page = 1; page <= 10; page++) {
      const data = await this.get(path, { page_size: 40, page }, signal);
      if (!Array.isArray(data.results))
        throw new RawgError("Could not load RAWG filters.");
      results.push(...data.results.map(record));
      if (!data.next) break;
    }
    return results;
  }
  async connect(signal?: AbortSignal) {
    const [platforms, genres] = await Promise.all([
      this.catalog("platforms", signal),
      this.catalog("genres", signal),
    ]);
    return { platforms, genres };
  }
  async sample({
    platforms,
    genre = "",
    history = [],
    signal,
  }: {
    platforms: number[];
    genre?: string;
    history?: Choice[];
    signal?: AbortSignal;
  }) {
    if (!platforms.length)
      throw new RawgError(
        "This platform is not available in the RAWG catalog.",
      );
    const params: Record<string, string | number> = {
      page_size: 40,
      platforms: platforms.join(","),
      ordering: "-added",
      dates: `1970-01-01,${new Date().toISOString().slice(0, 10)}`,
    };
    if (genre) params.genres = genre;
    const first = await this.get("games", params, signal);
    if (
      !Array.isArray(first.results) ||
      typeof first.count !== "number" ||
      !Number.isFinite(first.count)
    )
      throw new RawgError("RAWG returned an unexpected list.");
    const count = Math.max(0, first.count);
    if (!count) return { games: [], count: 0 };
    const pages = Math.ceil(count / 40);
    const used = new Set();
    let candidates: Game[] = [];
    // Try fresh random pages before falling back to the first page, without unbounded requests.
    for (let attempt = 0; attempt < 4 && used.size < pages; attempt++) {
      const page = 1 + Math.floor(this.random() * pages);
      if (used.has(page)) continue;
      used.add(page);
      let data;
      try {
        data =
          page === 1
            ? first
            : await this.get("games", { ...params, page }, signal);
      } catch (error) {
        if (error instanceof RawgError && error.status === 404) continue;
        throw error;
      }
      candidates = unseenGames(
        (Array.isArray(data.results) ? data.results : [])
          .map(normalizeGame)
          .filter((g): g is Game => g !== null),
        history,
      );
      if (candidates.length) break;
    }
    if (!candidates.length)
      candidates = unseenGames(
        first.results.map(normalizeGame).filter((g): g is Game => g !== null),
        history,
      );
    return { games: shuffle(candidates, this.random), count };
  }
  private storeIds = new Map<number, number | null>();
  async priceIdentity(game: Game, signal?: AbortSignal): Promise<Game> {
    if (game.steamAppId || !game.platforms.includes("pc")) return game;
    if (!this.storeIds.has(game.id)) {
      const data = await this.get(`games/${game.id}/stores`, {}, signal);
      let appId: number | null = null;
      for (const item of Array.isArray(data.results) ? data.results : []) {
        const value = record(item).url;
        if (typeof value !== "string") continue;
        try {
          const url = new URL(value);
          const id =
            url.hostname === "store.steampowered.com" &&
            url.protocol === "https:"
              ? url.pathname.match(/^\/app\/(\d+)(?:\/|$)/)?.[1]
              : undefined;
          if (id) {
            appId = Number(id);
            break;
          }
        } catch {
          /* Ignore invalid storefront links. */
        }
      }
      if (this.storeIds.size >= 200)
        this.storeIds.delete(this.storeIds.keys().next().value!);
      this.storeIds.set(game.id, appId);
    }
    return this.storeIds.get(game.id)
      ? { ...game, steamAppId: this.storeIds.get(game.id)! }
      : game;
  }
  async details(id: number, signal?: AbortSignal) {
    const raw = await this.get(`games/${encodeURIComponent(id)}`, {}, signal);
    return normalizeGame(raw);
  }
}
