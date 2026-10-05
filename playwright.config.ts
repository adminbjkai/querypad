import { defineConfig, devices } from "@playwright/test";

// Dedicated ports so tests never attach to some other app's dev server.
const APP_PORT = Number(process.env.E2E_PORT ?? 3217);
const COLLAB_PORT = Number(process.env.E2E_COLLAB_PORT ?? 1999);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
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
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined },
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
