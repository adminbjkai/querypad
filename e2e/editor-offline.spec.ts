import { test, expect } from "./fixtures";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

test("the SQL editor loads and runs without third-party network access", async ({ page }) => {
  const appOrigin = `http://localhost:${process.env.E2E_PORT ?? 3217}`;
  const blocked: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== appOrigin) {
      blocked.push(url.href);
      await route.abort();
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".monaco-editor .view-lines")).toBeVisible({ timeout: 30_000 });
  await page.locator(".monaco-editor").first().click();
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.insertText("SELECT 42 AS answer");
  await page.getByRole("button", { name: /^Run/ }).click();
  await expect(page.getByRole("columnheader", { name: /answer/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("gridcell", { name: "42" })).toBeVisible();
  expect(blocked).toEqual([]);
});
