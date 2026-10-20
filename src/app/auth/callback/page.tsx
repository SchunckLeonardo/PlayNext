import { AuthCallback } from "@/components/auth-callback";
import { getClientConfig } from "@/server/config";
export const dynamic = "force-dynamic";
export default function Page() {
  return <AuthCallback config={getClientConfig()} />;
}
