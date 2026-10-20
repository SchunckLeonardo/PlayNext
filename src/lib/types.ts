export interface Game {
  id: number;
  slug: string;
  name: string;
  image: string;
  genres: string[];
  platforms: string[];
  released: string | null;
  rating: number | null;
  metacritic: number | null;
  description: string;
  steamAppId?: number;
}
export type ChoiceStatus = "yes" | "no" | "played";
export interface Choice {
  game: Game;
  status: ChoiceStatus;
  decidedAt: string;
}
export interface Filters {
  platforms: string[];
  genre: string;
}
export interface AccountState {
  v: 1;
  rawg_key: string | null;
  history: Choice[];
  filters: Filters;
}
export interface ClientConfig {
  supabaseUrl: string;
  supabaseKey: string;
  local: boolean;
}
export type Country = "US" | "BR";
export type StoreKey = "steam" | "gog" | "epic";
export interface Money {
  amount: number;
  currency: "USD" | "BRL";
}
export interface StorePrice extends Money {
  regular: number;
  cut: number;
  url: string;
}
export interface PriceSnapshot {
  found: boolean;
  status:
    | "available"
    | "not-found"
    | "console-only"
    | "unconfigured"
    | "unavailable"
    | "rate-limited";
  source: "itad";
  country: Country;
  currency: Money["currency"];
  itadId: string | null;
  bestStore: StoreKey | null;
  stores: Record<StoreKey, StorePrice | null>;
  historyLow: Money | null;
  fetchedAt: string;
  expiresAt: number;
}

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function errorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  return error instanceof Error ? error.message : fallback;
}
