import type { ClientConfig } from "../lib/types";
import { record } from "../lib/types";

function isPublicKey(key: string): boolean {
  if (!key || key.startsWith("sb_publishable_")) return true;
  try {
    const payload = record(
      JSON.parse(Buffer.from(key.split(".")[1] || "", "base64url").toString()),
    );
    return key.startsWith("eyJ") && payload.role === "anon";
  } catch {
    return false;
  }
}
export function getClientConfig(): ClientConfig {
  const local =
    process.env.PLAYNEXT_LOCAL_TEST === "true" && !process.env.VERCEL;
  const supabaseUrl = local
    ? process.env.LOCAL_API_URL || ""
    : process.env.SUPABASE_URL || "";
  const supabaseKey = local
    ? process.env.LOCAL_PUBLISHABLE_KEY || ""
    : process.env.SUPABASE_PUBLISHABLE_KEY || "";
  if (local && !/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(supabaseUrl))
    throw new Error(
      "Local authentication requires an isolated loopback Supabase.",
    );
  if (supabaseUrl) {
    const url = new URL(supabaseUrl);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      (!local && url.protocol !== "https:")
    )
      throw new Error("Invalid public Supabase URL.");
  }
  if (!isPublicKey(supabaseKey))
    throw new Error("Browser configuration requires a public Supabase key.");
  return { supabaseUrl, supabaseKey, local };
}
