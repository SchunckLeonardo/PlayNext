import { PlayNext } from "@/components/playnext";
import { getClientConfig } from "@/server/config";
export const dynamic = "force-dynamic";
export default function Page() {
  return <PlayNext config={getClientConfig()} />;
}
