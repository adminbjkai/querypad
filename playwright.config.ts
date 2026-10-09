import { defineConfig, devices } from "@playwright/test";

import { existsSync } from "node:fs";

// Dedicated ports so tests never attach to some other app's dev server.
const APP_PORT = Number(process.env.E2E_PORT ?? 3217);
const COLLAB_PORT = Number(process.env.E2E_COLLAB_PORT ?? 1999);
const SYSTEM_CHROME = ["/usr/bin/google-chrome", "/snap/bin/chromium", "/usr/bin/chromium-browser"].find(
  (p) => existsSync(p)
);
const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH || SYSTEM_CHROME || undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : (process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : 4),
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Optional: reuse an already-installed Chromium instead of Playwright's pinned build.
        launchOptions: { executablePath: CHROMIUM_PATH },
      },
    },
  ],
  webServer: [
    {
      command: `npx next dev -p ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { NEXT_PUBLIC_COLLAB_URL: `ws://localhost:${COLLAB_PORT}/collab` },
    },
    {
      command: "node collab/server.mjs",
      url: `http://localhost:${COLLAB_PORT}/collab/health`,
      reuseExistingServer: false,
      env: { PORT: String(COLLAB_PORT) },
    },
  ],
});
