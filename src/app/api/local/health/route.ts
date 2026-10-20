import { getClientConfig } from "@/server/config";
export const dynamic = "force-dynamic";
export async function GET() {
  if (process.env.VERCEL) return new Response(null, { status: 404 });
  const config = getClientConfig();
  return config.local
    ? Response.json({
        local: true,
        api: config.supabaseUrl,
        framework: "nextjs",
        prices: {
          configured: !!process.env.ITAD_API_KEY,
          secretName: "ITAD_API_KEY",
        },
      })
    : new Response(null, { status: 404 });
}
