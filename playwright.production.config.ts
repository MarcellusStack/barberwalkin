import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "mantine-integration.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:3200",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3200",
    env: {
      MANTINE_INTEGRATION_TEST: "1",
    },
    url: "http://127.0.0.1:3200/mantine",
    reuseExistingServer: false,
  },
});
