import { SharedReview } from "@/components/shared-review";
import { getClientConfig } from "@/server/config";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SharedReview id={id} config={getClientConfig()} />;
}
