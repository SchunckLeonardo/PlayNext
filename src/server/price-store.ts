import { createClient } from "@supabase/supabase-js";

export interface PriceStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlMs: number): Promise<void>;
  take(bucket: string, limit: number, windowMs: number): Promise<boolean>;
}
export class MemoryPriceStore implements PriceStore {
  private cache = new Map<string, { value: unknown; expires: number }>();
  private windows = new Map<string, number[]>();
  constructor(private now = Date.now) {}
  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry || entry.expires <= this.now()) {
      this.cache.delete(key);
      return null;
    }
    return structuredClone(entry.value) as T;
  }
  async set(key: string, value: unknown, ttlMs: number) {
    if (this.cache.size >= 500)
      this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, {
      value: structuredClone(value),
      expires: this.now() + ttlMs,
    });
  }
  async take(bucket: string, limit: number, windowMs: number) {
    const now = this.now();
    for (const [key, entries] of this.windows)
      if (!entries.some((t) => t > now - 300_000)) this.windows.delete(key);
    const entries = (this.windows.get(bucket) || []).filter(
      (t) => t > now - windowMs,
    );
    if (entries.length >= limit) return false;
    if (!this.windows.has(bucket) && this.windows.size >= 2000) return false;
    this.windows.set(bucket, [...entries, now]);
    return true;
  }
}
// Shared database state keeps Vercel function instances inside one upstream budget.
export class SupabasePriceStore implements PriceStore {
  private client;
  constructor(url: string, secret: string) {
    this.client = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  async get<T>(key: string): Promise<T | null> {
    const { data, error } = await this.client.rpc("playnext_price_cache_get", {
      p_key: key,
    });
    if (error) throw new Error("PRICE_STORE_UNAVAILABLE");
    return data as T | null;
  }
  async set(key: string, value: unknown, ttlMs: number) {
    const { error } = await this.client.rpc("playnext_price_cache_set", {
      p_key: key,
      p_value: value,
      p_ttl_ms: ttlMs,
    });
    if (error) throw new Error("PRICE_STORE_UNAVAILABLE");
  }
  async take(bucket: string, limit: number, windowMs: number) {
    const { data, error } = await this.client.rpc("playnext_price_quota_take", {
      p_bucket: bucket,
      p_limit: limit,
      p_window_ms: windowMs,
    });
    if (error || typeof data !== "boolean")
      throw new Error("PRICE_STORE_UNAVAILABLE");
    return data;
  }
}
