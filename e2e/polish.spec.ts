import { test, expect, type Page, type Route } from "./fixtures";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

async function openWithSamples(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 30_000 });
}

async function setMonacoValue(page: Page, editorIndex: number, sql: string) {
  await page.locator(".monaco-editor").nth(editorIndex).click();
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.type(sql);
}

test.describe("Workspace polish regressions", () => {
  test("pipeline results stay attached to their pipeline and clear when its steps change", async ({ page }) => {
    await openWithSamples(page);
    await page.getByRole("button", { name: "Pipelines", exact: true }).click();
    await page.getByRole("button", { name: "Add the first step" }).click();
    await setMonacoValue(page, 0, "SELECT 1 AS value");
    await page.getByRole("button", { name: "Run pipeline" }).click();
    await expect(page.getByRole("gridcell", { name: "1" })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "New pipeline" }).click();
    await page.getByRole("tab", { name: "Pipeline 1" }).click();
    await expect(page.getByRole("gridcell", { name: "1" })).toBeVisible();

    await setMonacoValue(page, 0, "SELECT 2 AS value");
    await expect(page.getByRole("gridcell", { name: "1" })).toHaveCount(0);
    await expect(page.getByText("No results yet")).toBeVisible();
  });

  test("assistant pauses auto-follow when the reader scrolls up and offers the latest response", async ({ page }) => {
    let postCount = 0;
    let releaseSecond = () => {};
    let signalSecondRequest = () => {};
    const secondResponseGate = new Promise<void>((resolve) => { releaseSecond = resolve; });
    const secondRequestStarted = new Promise<void>((resolve) => { signalSecondRequest = resolve; });
    const longReply = Array.from({ length: 45 }, (_, i) => `Response paragraph ${i + 1}: this detail makes the conversation long enough to scroll.`).join("\n\n");

    await page.route("**/api/complete", async (route: Route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: { providers: ["local-claude"] } });
        return;
      }
      postCount++;
      if (postCount === 1) {
        await route.fulfill({ status: 200, contentType: "text/plain", body: longReply });
        return;
      }
      signalSecondRequest();
      await secondResponseGate;
      await route.fulfill({ status: 200, contentType: "text/plain", body: "A later response arrives while you are reading above." });
    });

    await openWithSamples(page);
    await page.keyboard.press(`${MOD}+i`);
    const panel = page.getByRole("complementary", { name: "Assistant" });
    const feed = panel.locator("[aria-live='polite']");
    await panel.getByLabel("Message the assistant").fill("Give me a detailed overview.");
    await panel.getByLabel("Message the assistant").press("Enter");
    await expect(panel.getByText("Response paragraph 45:")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => feed.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

    await panel.getByLabel("Message the assistant").fill("One more detail.");
    await panel.getByLabel("Message the assistant").press("Enter");
    await secondRequestStarted;
    await feed.evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event("scroll"));
    });
    releaseSecond();

    const latest = panel.getByRole("button", { name: "Scroll to latest response" });
    await expect(latest).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => feed.evaluate((el) => el.scrollTop)).toBe(0);
    await latest.click();
    await expect.poll(() => feed.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 1)).toBe(true);
  });

  test("visual query designer toggles, adds tables, and transfers SQL to editor", async ({ page }) => {
    await openWithSamples(page);
    const toggle = page.getByRole("button", { name: "Visual query designer" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Query designer")).toBeVisible();
    for (const table of ["departments", "employees"]) {
      await page.getByRole("button", { name: "Add table" }).click();
      await page.getByRole("menuitem", { name: table, exact: true }).click();
    }
    await expect(page.getByLabel("Resolved SQL")).toContainText('JOIN "employees" ON "departments"."dept_id" = "employees"."dept_id"');
    // The sample query is still in the tab, so the designer's SQL opens in a new tab instead of replacing it.
    const tabs = page.getByRole("tab");
    const before = await tabs.count();
    await page.getByRole("button", { name: "Use in editor" }).click();
    await expect(page.getByText("Opened the designer's SQL in a new tab. Your query is unchanged.")).toBeVisible();
    await expect(tabs).toHaveCount(before + 1);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  });
});
