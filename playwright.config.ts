import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 30000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel: process.env.CI ? undefined : "chrome",
    locale: "en-US",
    viewport: { width: 1440, height: 1000 },
    userAgent: "Mozilla/5.0 PlayNextBrowserTest",
    trace: "off",
    screenshot: "only-on-failure",
  },
});
