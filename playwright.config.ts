import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  use: {
    baseURL: "http://127.0.0.1:3100",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    env: {
      NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210",
    },
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
  },
});
