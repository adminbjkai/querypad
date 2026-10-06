import { test, expect, isolate, type Page } from "./fixtures";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

async function openWithSamples(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 30_000 });
}

async function runSample(page: Page) {
  await page.getByRole("button", { name: /^Run/ }).click();
  await expect(page.getByRole("columnheader", { name: /dept_name/ })).toBeVisible({ timeout: 15_000 });
}

test.describe("QueryPad", () => {
  test("loads sample data and shows the welcome note", async ({ page }) => {
    await openWithSamples(page);
    await expect(page.getByRole("button", { name: "departments", exact: true })).toBeVisible();
    await expect(page.getByText("You're exploring two sample tables.")).toBeVisible();
  });

  test("runs the sample query and records it in history", async ({ page }) => {
    await openWithSamples(page);
    await runSample(page);
    await expect(page.getByRole("columnheader", { name: /avg_salary/ })).toBeVisible();
    await expect(page.getByText("Engineering")).toBeVisible();

    await page.getByRole("button", { name: "History", exact: true }).click();
    await expect(page.getByText("SELECT d.dept_name").first()).toBeVisible();
  });

  test("sorts and filters result rows", async ({ page }) => {
    await openWithSamples(page);
    await runSample(page);
    const firstCell = page.getByRole("row").nth(1).getByRole("gridcell").first();

    await page.getByRole("columnheader", { name: /dept_name/ }).click();
    await expect(firstCell).toHaveText("Design");
    await page.getByRole("columnheader", { name: /dept_name/ }).click();
    await expect(firstCell).toHaveText("Sales");

    await page.getByLabel("Filter rows").fill("market");
    await expect(page.getByRole("row")).toHaveCount(2); // header + Marketing
    await expect(firstCell).toHaveText("Marketing");
  });

  test("shows a data profile for a sample table", async ({ page }) => {
    await openWithSamples(page);
    await page.getByRole("button", { name: "Profile employees" }).click({ force: true });
    await expect(page.getByText("employees profile")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/\d+(\.\d)?% empty/).first()).toBeVisible();
    await expect(page.getByText(/\d+ distinct/).first()).toBeVisible();
    // Dates render as calendar dates, not epoch numbers.
    await expect(page.getByText(/2018-\d\d-\d\d to 20\d\d-\d\d-\d\d/)).toBeVisible();
  });

  test("discovers, explains, and accepts relationships", async ({ page }) => {
    await openWithSamples(page);
    await page.getByRole("button", { name: "Joins", exact: true }).click();
    await expect(page.getByText(/inferred from your data/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Why?" }).first().click();
    await expect(page.getByText(/values are present in/).first()).toBeVisible();
    await page.getByRole("button", { name: "Accept" }).first().click();
    await expect(page.getByText("accepted", { exact: true })).toBeVisible();
  });

  test("command palette previews a table in a new tab", async ({ page }) => {
    await openWithSamples(page);
    await page.keyboard.press(`${MOD}+p`);
    await page.getByLabel("Search commands").fill("preview depart");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("tab", { name: /Query 2/ })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /budget/ })).toBeVisible({ timeout: 15_000 });
  });

  test("copies agent context with schema and query state", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openWithSamples(page);
    await runSample(page);
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Copy context for an agent" }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("# QueryPad Context");
    expect(copied).toContain("### employees");
    expect(copied).toContain("### departments");
    expect(copied).toContain("SELECT d.dept_name");
    expect(copied).toContain("## Latest Result");
  });

  test("AI assistant lets you switch providers", async ({ page }) => {
    await openWithSamples(page);
    await page.getByRole("button", { name: /Ask AI/ }).click();
    // Without the local AI bridge (dev server), signed-in CLI models show as unavailable.
    await page.getByRole("button", { name: "AI model" }).click();
    await expect(page.getByRole("menuitemradio", { name: /Codex.*GPT-6 Luna.*unavailable/ })).toBeDisabled();
    await page.getByRole("menuitemradio", { name: /Sonnet 5\.5.*add key/ }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByPlaceholder("Enter your Anthropic API key (sk-ant-...)")).toBeVisible();
    await page.getByRole("button", { name: "AI model" }).click();
    await page.getByRole("menuitemradio", { name: /OpenAI.*GPT-5\.5/ }).click();
    await expect(page.getByPlaceholder("Enter your OpenAI API key (sk-...)")).toBeVisible();
  });

  test("failed queries offer a fix with AI", async ({ page }) => {
    await openWithSamples(page);
    await page.getByRole("button", { name: "New tab" }).click();
    await page.locator(".monaco-editor").click();
    await page.keyboard.type("SELECT nope FROM employees");
    await page.keyboard.press(`${MOD}+Enter`);
    await expect(page.getByText("The query failed")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Fix with AI" }).click();
    await expect(page.getByLabel("Describe the query")).toHaveValue(/Fix the current query/);
  });

  test("switches between SQL and pipeline mode", async ({ page }) => {
    await openWithSamples(page);
    await page.getByRole("button", { name: "Pipelines", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Pipeline 1" })).toBeVisible();
    await page.getByRole("button", { name: "Add the first step" }).click();
    await expect(page.getByLabel("Step name (becomes a table name)")).toHaveValue("step_1");
    await page.getByRole("button", { name: "SQL", exact: true }).click();
    await expect(page.getByRole("tab", { name: /Query 1/ })).toBeVisible();
  });

  test("keeps tabs and theme across reloads", async ({ page }) => {
    await openWithSamples(page);
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await page.getByRole("button", { name: "New tab" }).click();
    await page.locator(".monaco-editor").click();
    await page.keyboard.type("SELECT 42 AS answer");
    await page.waitForTimeout(800); // debounced save
    await page.reload();
    await expect(page.getByRole("tab", { name: /Query 2/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: /^Run/ }).click();
    await expect(page.getByRole("columnheader", { name: /answer/ })).toBeVisible({ timeout: 10_000 });
  });

  test("imports a file and replaces the sample tables", async ({ page }) => {
    await openWithSamples(page);
    await page.getByRole("button", { name: "Add data" }).click();
    await page.getByLabel("Choose data files").setInputFiles(["fixtures/data/users.csv", "fixtures/data/payments.csv"]);
    await expect(page.getByRole("button", { name: "users", exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "payments", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "employees", exact: true })).toHaveCount(0);
  });

  test("clears the workspace and reloads sample data", async ({ page }) => {
    await openWithSamples(page);
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Clear this space" }).click();
    await page.getByRole("dialog", { name: "Clear this space?" }).getByRole("button", { name: "Clear space" }).click();
    await expect(page.getByText("Drop in your data files.")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Try sample data" }).click();
    await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test("opens a share link without touching the saved workspace", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openWithSamples(page);
    await page.getByRole("button", { name: /^Share/ }).click();
    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url).toContain("/shared?s=");

    const viewer = await context.newPage();
    await viewer.goto(url);
    await expect(viewer.getByText("Shared link")).toBeVisible({ timeout: 30_000 });
    await expect(viewer.getByRole("button", { name: "employees", exact: true })).toBeVisible();
    await viewer.getByRole("button", { name: "Remove employees" }).click({ force: true });
    // Even clearing everything in the shared view must leave the owner's data alone.
    await viewer.getByRole("button", { name: "More" }).click();
    await viewer.getByRole("menuitem", { name: "Clear this space" }).click();
    await viewer.getByRole("dialog", { name: "Clear this space?" }).getByRole("button", { name: "Clear space" }).click();
    await expect(viewer.getByText("Drop in your data files.")).toBeVisible({ timeout: 10_000 });
    await viewer.waitForTimeout(800);

    // The owner's saved workspace still has both tables.
    await page.reload();
    await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 30_000 });
  });

  test("collaborates live through the relay", async ({ browser }) => {
    const ctxA = await browser.newContext();
    await isolate(ctxA);
    await ctxA.grantPermissions(["clipboard-read", "clipboard-write"]);
    const a = await ctxA.newPage();
    await openWithSamples(a);
    await a.getByRole("button", { name: "Collaborate" }).click();
    await a.getByRole("button", { name: "Start room and copy invite" }).click();
    await expect(a.getByRole("button", { name: "Leave" })).toBeVisible({ timeout: 15_000 });
    const invite = await a.evaluate(() => navigator.clipboard.readText());
    expect(invite).toMatch(/\?room=[A-Za-z0-9_-]+$/);

    const ctxB = await browser.newContext();
    await isolate(ctxB);
    const b = await ctxB.newPage();
    await b.goto(invite);
    await expect(b.getByRole("button", { name: "Leave" })).toBeVisible({ timeout: 30_000 });
    // Files added in the room reach everyone in it.
    await a.getByRole("button", { name: "Add data" }).click();
    await a.getByLabel("Choose data files").setInputFiles(["fixtures/data/users.csv"]);
    await expect(b.getByRole("button", { name: "users", exact: true })).toBeVisible({ timeout: 15_000 });

    await a.locator(".monaco-editor").click();
    await a.keyboard.press(`${MOD}+End`);
    await a.keyboard.type("\n-- hello from A");
    await expect(b.locator(".monaco-editor")).toContainText("hello from A", { timeout: 10_000 });

    // After switching tabs, the editor binding is re-established: B sees A's cursor.
    await a.getByRole("button", { name: "New tab" }).click();
    await b.getByRole("tab", { name: /Query 2/ }).click();
    await a.locator(".monaco-editor").click();
    await a.keyboard.type("SELECT 2");
    await expect(b.locator(".monaco-editor")).toContainText("SELECT 2", { timeout: 10_000 });
    await expect(b.locator('.monaco-editor [class*="yRemoteSelectionHead"]').first()).toBeAttached({ timeout: 10_000 });
    await ctxA.close();
    await ctxB.close();
  });
});
