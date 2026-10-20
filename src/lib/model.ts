import type { Choice, ChoiceStatus, Game } from "./types";
import { record } from "./types";
export const PLATFORMS = [
  { slug: "pc", label: "PC", family: "PC" },
  { slug: "playstation1", label: "PS1", family: "PlayStation" },
  { slug: "playstation2", label: "PS2", family: "PlayStation" },
  { slug: "playstation3", label: "PS3", family: "PlayStation" },
  { slug: "playstation4", label: "PS4", family: "PlayStation" },
  { slug: "playstation5", label: "PS5", family: "PlayStation" },
  { slug: "nintendo-ds", label: "DS / NDS", family: "Nintendo" },
  { slug: "nintendo-3ds", label: "3DS", family: "Nintendo" },
  { slug: "nintendo-switch", label: "Switch", family: "Nintendo" },
  { slug: "xbox360", label: "Xbox 360", family: "Xbox" },
];
export const GENRES = [
  { slug: "action", name: "Action" },
  { slug: "adventure", name: "Adventure" },
  { slug: "role-playing-games-rpg", name: "RPG" },
  { slug: "indie", name: "Indie" },
  { slug: "strategy", name: "Strategy" },
  { slug: "shooter", name: "Shooter" },
  { slug: "casual", name: "Casual" },
  { slug: "simulation", name: "Simulation" },
  { slug: "puzzle", name: "Puzzle" },
  { slug: "arcade", name: "Arcade" },
  { slug: "platformer", name: "Platformer" },
  { slug: "racing", name: "Racing" },
  { slug: "sports", name: "Sports" },
  { slug: "fighting", name: "Fighting" },
  { slug: "family", name: "Family" },
  { slug: "board-games", name: "Board games" },
  { slug: "educational", name: "Educational" },
  { slug: "card", name: "Card" },
  { slug: "massively-multiplayer", name: "Massively multiplayer" },
];
export const STATUSES = {
  yes: { label: "Want to play", icon: "heart", color: "green" },
  no: { label: "Not interested", icon: "x", color: "red" },
  played: { label: "Played", icon: "check", color: "blue" },
};
export const HISTORY_KEY = "playnext.history.v1";
export const FILTERS_KEY = "playnext.filters.v1";
export const API_KEY = "playnext.rawg.session";

export function shuffle<T>(items: readonly T[], random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function matchesFilters(
  game: Game,
  platforms: string[] = [],
  genre = "",
) {
  return (
    (!platforms.length ||
      game.platforms.some((slug) => platforms.includes(slug))) &&
    (!genre || game.genres.includes(genre))
  );
}
export function unseenGames(games: Game[], history: Choice[]) {
  const seen = new Set(history.map((entry) => entry.game.id));
  const unique = new Set();
  return games.filter(
    (game) => !seen.has(game.id) && !unique.has(game.id) && unique.add(game.id),
  );
}
export function decide(
  history: Choice[],
  game: Game,
  status: ChoiceStatus,
  now = new Date().toISOString(),
): Choice[] {
  if (!STATUSES[status]) throw new Error("Invalid choice.");
  return [
    { game, status, decidedAt: now },
    ...history.filter((entry) => entry.game.id !== game.id),
  ];
}
export function readHistory(storage: Pick<Storage, "getItem">): Choice[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((entry) => {
      const e = record(entry),
        g = record(e.game);
      return (
        typeof e.status === "string" &&
        e.status in STATUSES &&
        Number.isSafeInteger(g.id) &&
        typeof g.name === "string" &&
        typeof g.slug === "string" &&
        Array.isArray(g.genres) &&
        Array.isArray(g.platforms)
      );
    }) as Choice[];
  } catch {
    return [];
  }
}
export function readFilters(storage: Pick<Storage, "getItem">) {
  try {
    const filters = record(JSON.parse(storage.getItem(FILTERS_KEY) || "null"));
    return {
      platforms: Array.isArray(filters.platforms)
        ? filters.platforms.filter(
            (slug): slug is string =>
              typeof slug === "string" &&
              PLATFORMS.some((p) => p.slug === slug),
          )
        : [],
      genre: typeof filters.genre === "string" ? filters.genre : "",
    };
  } catch {
    return { platforms: [] as string[], genre: "" };
  }
}
export function safeImage(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}
export function normalizeGame(value: unknown): Game | null {
  const raw = record(value);
  if (
    !Number.isSafeInteger(raw.id) ||
    typeof raw.name !== "string" ||
    typeof raw.slug !== "string"
  )
    return null;
  return {
    id: raw.id as number,
    slug: raw.slug,
    name: raw.name,
    image: safeImage(raw.background_image),
    genres: (Array.isArray(raw.genres) ? raw.genres : [])
      .map((g) => record(g).slug)
      .filter((s): s is string => typeof s === "string"),
    platforms: (Array.isArray(raw.platforms) ? raw.platforms : [])
      .map((p) => record(record(p).platform).slug)
      .filter((s): s is string => typeof s === "string"),
    released: typeof raw.released === "string" ? raw.released : null,
    rating:
      typeof raw.rating === "number" && Number.isFinite(raw.rating)
        ? raw.rating
        : null,
    metacritic:
      typeof raw.metacritic === "number" && Number.isFinite(raw.metacritic)
        ? raw.metacritic
        : null,
    description:
      typeof raw.description_raw === "string" ? raw.description_raw : "",
  };
}
