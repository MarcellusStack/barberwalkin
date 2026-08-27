import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: ["application-shell.spec.ts", "convex-integration.spec.ts"],
  use: {
    baseURL: "http://127.0.0.1:3200",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3200",
    env: {
      NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210",
    },
    url: "http://127.0.0.1:3200",
    reuseExistingServer: false,
  },
});
