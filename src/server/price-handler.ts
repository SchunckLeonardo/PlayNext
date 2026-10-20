import { createHash } from "node:crypto";
import {
  CLIENT_HEADER_NAME,
  CLIENT_HEADER_VALUE,
  PROOF_HEADER_NAME,
  computeBotProof,
} from "../lib/prices";
import { ItadPriceService, PriceError, type PriceQuery } from "./itad";
import { SupabasePriceStore } from "./price-store";

function createProductionService() {
  const key = process.env.ITAD_API_KEY || "";
  const url = process.env.SUPABASE_URL || "";
  const secret = process.env.SUPABASE_SECRET_KEY || "";
  if (process.env.VERCEL && (!url || !secret))
    throw new PriceError("Shared price protection is not configured.", 503);
  return new ItadPriceService({
    apiKey: key,
    store: url && secret ? new SupabasePriceStore(url, secret) : undefined,
  });
}
let service: ItadPriceService | undefined;
export function parsePriceQuery(url: URL): PriceQuery {
  const title = (url.searchParams.get("title") || "").trim();
  const country = url.searchParams.get("country") || "US";
  const released = url.searchParams.get("released") || undefined;
  const appid = url.searchParams.get("steamAppId");
  const validDate =
    !released ||
    (/^\d{4}-\d{2}-\d{2}$/.test(released) &&
      !Number.isNaN(Date.parse(released)) &&
      new Date(released).toISOString().slice(0, 10) === released);
  if (
    title.length < 1 ||
    title.length > 160 ||
    /[\x00-\x1f]/.test(title) ||
    !["US", "BR"].includes(country) ||
    !validDate ||
    (appid !== null && !/^[1-9]\d{0,9}$/.test(appid))
  )
    throw new PriceError("Invalid price query.", 400);
  return {
    title,
    country: country as "US" | "BR",
    released,
    steamAppId: appid ? Number(appid) : undefined,
  };
}
export async function handlePriceRequest(
  request: Request,
  injected?: ItadPriceService,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  try {
    if (request.method !== "GET")
      return Response.json(
        { error: "Method not allowed." },
        { status: 405, headers: { ...headers, Allow: "GET" } },
      );
    const url = new URL(request.url),
      query = parsePriceQuery(url);
    const origin = request.headers.get("origin");
    const expectedOrigin = `${process.env.VERCEL ? "https:" : url.protocol}//${request.headers.get("host") || url.host}`;
    const proof = request.headers.get(PROOF_HEADER_NAME),
      minute = Math.floor(Date.now() / 60000);
    if (
      (origin && origin !== expectedOrigin) ||
      request.headers.get("sec-fetch-site") === "cross-site" ||
      url.searchParams.has("website") ||
      url.searchParams.has("bot") ||
      /bot|crawler|spider|scraper|curl|wget|headlesschrome/i.test(
        request.headers.get("user-agent") || "",
      ) ||
      request.headers.get(CLIENT_HEADER_NAME) !== CLIENT_HEADER_VALUE ||
      ![minute, minute - 1].some(
        (m) => proof === computeBotProof(query.title, query.country, m),
      )
    )
      throw new PriceError("Price request denied.", 403);
    const clientId = createHash("sha256")
      .update(
        request.headers.get("x-vercel-forwarded-for") ||
          request.headers.get("x-forwarded-for") ||
          "local",
      )
      .digest("hex");
    const current = injected ?? (service ??= createProductionService());
    return Response.json(await current.getPrices(query, clientId), { headers });
  } catch (error) {
    const known = error instanceof PriceError;
    const status = known ? error.status : 503;
    if (status === 429)
      headers["Retry-After"] = String(
        error instanceof PriceError ? error.retryAfter : 30,
      );
    return Response.json(
      {
        error: known
          ? error.message
          : "Store prices are temporarily unavailable.",
        status:
          status === 429
            ? "rate-limited"
            : known && status === 503
              ? "unconfigured"
              : "unavailable",
      },
      { status, headers },
    );
  }
}
