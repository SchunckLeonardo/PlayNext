import { createClient } from "@supabase/supabase-js";
import { getClientConfig } from "@/server/config";
export async function POST(request: Request) {
  if (process.env.VERCEL) return new Response(null, { status: 404 });
  const config = getClientConfig();
  const url = new URL(request.url);
  const publicOrigin = new URL(
    `http://${request.headers.get("host") || url.host}`,
  );
  if (
    !config.local ||
    process.env.VERCEL ||
    !["127.0.0.1", "localhost"].includes(publicOrigin.hostname)
  )
    return new Response(null, { status: 404 });
  if (request.headers.get("origin") !== publicOrigin.origin)
    return new Response(null, { status: 403 });
  const internalUrl = process.env.LOCAL_INTERNAL_API_URL || config.supabaseUrl;
  if (
    !/^http:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal):54321$/.test(
      internalUrl,
    )
  )
    return new Response(null, { status: 403 });
  const client = createClient(internalUrl, config.supabaseKey, {
    auth: { persistSession: false },
  });
  const result = await client.auth.signInWithPassword({
    email: process.env.LOCAL_TEST_EMAIL || "",
    password: process.env.LOCAL_TEST_PASSWORD || "",
  });
  return Response.json(
    result.error
      ? { error: "Local sign-in failed." }
      : { session: result.data.session },
    {
      status: result.error ? 401 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
