import { handlePriceRequest } from "@/server/price-handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  return handlePriceRequest(request);
}
export async function POST(request: Request) {
  return handlePriceRequest(request);
}
