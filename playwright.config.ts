import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3100",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    env: {
      NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210",
      NEXT_PUBLIC_CONVEX_SITE_URL: "http://127.0.0.1:3211",
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
      BETTER_AUTH_SECRET: "development-secret-barberwalkin-must-be-32-chars",
    },
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
  },
});
