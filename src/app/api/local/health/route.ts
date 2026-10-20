import { getClientConfig, localServerApiUrl } from "@/server/config";
import { SupabasePriceStore } from "@/server/price-store";
export const dynamic = "force-dynamic";
export async function GET() {
  if (process.env.VERCEL) return new Response(null, { status: 404 });
  const config = getClientConfig();
  if (!config.local) return new Response(null, { status: 404 });
  try {
    await new SupabasePriceStore(
      localServerApiUrl(),
      process.env.SUPABASE_SECRET_KEY || "",
    ).get("health:connectivity");
    return Response.json({
      local: true,
      api: config.supabaseUrl,
      framework: "nextjs",
      priceStoreReady: true,
      prices: {
        configured: !!process.env.ITAD_API_KEY,
        secretName: "ITAD_API_KEY",
      },
    });
  } catch {
    return Response.json(
      { error: "The isolated database is not ready." },
      { status: 503 },
    );
  }
}
