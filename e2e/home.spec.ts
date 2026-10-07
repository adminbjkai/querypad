import { test, expect, type Page, type Route } from "./fixtures";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

async function openWithSamples(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "departments", exact: true })).toBeVisible();
}

async function openHome(page: Page) {
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByRole("heading", { name: /What do you want to know/, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
}

test.describe("Home", () => {
  test("shows sample catalog totals, searchable datasets, and the semantic model", async ({ page }) => {
    await openWithSamples(page);
    await openHome(page);

    const summary = page.getByLabel("Workspace summary");
    await expect(summary.getByText("Rows")).toBeVisible();
    await expect(summary.getByText("16", { exact: true })).toBeVisible();

    const catalog = page.getByRole("region", { name: "Data catalog" });
    await expect(catalog.getByRole("row", { name: /employees.*12.*5/ })).toBeVisible();
    await expect(catalog.getByRole("row", { name: /departments.*4.*4/ })).toBeVisible();
    await expect(catalog.getByText("2 datasets")).toBeVisible();

    const search = page.getByRole("textbox", { name: "Search data catalog" });
    await search.fill("budget");
    await expect(catalog.getByText("1 datasets")).toBeVisible();
    await expect(catalog.getByRole("row", { name: /departments/ })).toBeVisible();
    await expect(catalog.getByRole("row", { name: /employees/ })).toHaveCount(0);

    await search.fill("no-such-column");
    await expect(catalog.getByText(/No datasets match/)).toBeVisible();
    await catalog.getByRole("button", { name: "Clear search" }).click();
    await expect(catalog.getByText("2 datasets")).toBeVisible();
    await expect(catalog.getByRole("row", { name: /employees/ })).toBeVisible();

    const semanticModel = page.getByRole("region", { name: "Semantic model" });
    await expect(semanticModel.getByRole("heading", { name: "Employee" })).toBeVisible();
    await expect(semanticModel.getByRole("heading", { name: "Department" })).toBeVisible();
    await expect(semanticModel.getByText("Belongs to Department")).toBeVisible({ timeout: 20_000 });

    // Inspect jumps to the workbench with the column profile open.
    await page.getByRole("button", { name: "Inspect dataset employees" }).click();
    await expect(page.getByRole("button", { name: "Tables", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("complementary", { name: /employees/ })).toBeVisible();
  });

  test("preview opens a runnable SQL tab and New query returns to the workbench", async ({ page }) => {
    await openWithSamples(page);
    await openHome(page);

    await page.getByRole("button", { name: "Preview dataset employees" }).click();
    await expect(page.getByRole("button", { name: "SQL", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("tab", { name: /Query 2/ })).toBeVisible();
    await expect(page.locator(".monaco-editor")).toContainText("employees");
    await expect(page.locator(".monaco-editor")).toContainText("LIMIT");
    await expect(page.getByRole("columnheader", { name: /emp_id/ })).toBeVisible({ timeout: 20_000 });

    await openHome(page);
    await page.getByRole("button", { name: "New query" }).click();
    await expect(page.getByRole("button", { name: "SQL", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("tab", { name: /Query 3/ })).toBeVisible();
    await expect(page.locator(".monaco-editor")).toBeVisible();

    await page.locator(".monaco-editor").first().click();
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press("Delete");
    await page.keyboard.insertText("SELECT 9 AS answer");
    await page.getByRole("button", { name: /^Run/ }).click();
    await expect(page.getByRole("gridcell", { name: "9" })).toBeVisible({ timeout: 15_000 });
  });

  test("asks the Assistant from Home and keeps every chat", async ({ page }) => {
    const replies = ["There are **2** tables: employees and departments.", "Departments has **4** rows."];
    let calls = 0;
    await page.route("**/api/complete", async (route: Route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: { providers: ["local-claude"] } });
        return;
      }
      await route.fulfill({ status: 200, contentType: "text/plain", body: replies[calls++] ?? "Done." });
    });

    await openWithSamples(page);
    await openHome(page);
    const composer = page.getByLabel("Ask about your data");
    await composer.fill("What tables do I have?");
    await composer.press("Enter");

    const panel = page.getByRole("complementary", { name: "Assistant" });
    await expect(panel.getByTestId("assistant-user")).toHaveText(/What tables do I have\?/);
    await expect(panel.getByText("There are")).toBeVisible({ timeout: 15_000 });

    // A second chat, then both are listed and the first one reopens.
    await panel.getByRole("button", { name: "New conversation" }).click();
    await panel.getByLabel("Message the assistant").fill("How big is departments?");
    await panel.getByLabel("Message the assistant").press("Enter");
    await expect(panel.getByText("Departments has")).toBeVisible({ timeout: 15_000 });
    await panel.getByRole("button", { name: "All chats" }).click();
    await expect(panel.getByRole("button", { name: /^How big is departments\?/ })).toBeVisible();
    await panel.getByRole("button", { name: /^What tables do I have\?/ }).click();
    await expect(panel.getByText("There are")).toBeVisible();
    await expect(panel.getByText("Departments has")).toHaveCount(0);

    // Deleting asks for a second click.
    await panel.getByRole("button", { name: "All chats" }).click();
    await panel.getByRole("button", { name: "Delete chat: How big is departments?" }).click();
    await expect(panel.getByRole("button", { name: /^How big is departments\?/ })).toBeVisible();
    await panel.getByRole("button", { name: "Confirm delete chat: How big is departments?" }).click();
    await expect(panel.getByRole("button", { name: /^How big is departments\?/ })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: /^What tables do I have\?/ })).toBeVisible();
  });

  test("navigation collapses to icons and remembers it", async ({ page }) => {
    await openWithSamples(page);
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByText("Library")).toBeVisible();
    await nav.getByRole("button", { name: "Collapse navigation" }).click();
    await expect(nav.getByText("Library")).toHaveCount(0);
    // Icon-only items keep their names.
    await nav.getByRole("button", { name: "Joins", exact: true }).click();
    await expect(page.getByRole("button", { name: "Joins", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(page.getByRole("button", { name: "Expand navigation" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Expand navigation" }).click();
    await expect(nav.getByText("Library")).toBeVisible();
  });

  test("keeps Home usable in both themes at a 390px viewport", async ({ page }) => {
    await openWithSamples(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openHome(page);
    await page.getByRole("button", { name: "Dismiss" }).click();

    await expect(page.getByRole("region", { name: "Data catalog" })).toBeVisible();
    await page.screenshot({ path: "/tmp/querypad-home-mobile.png", fullPage: true });

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasHorizontalOverflow).toBe(false);

    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("region", { name: "Semantic model" })).toBeVisible();
    const darkHasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(darkHasHorizontalOverflow).toBe(false);

    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Light theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});
