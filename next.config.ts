import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const config: NextConfig = {
  agentRules: false,
  output: "standalone",
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
  poweredByHeader: false,
  async redirects() {
    return [
      {
        source: "/auth-callback.html",
        destination: "/auth/callback",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
