import { test, expect, type Page } from "./fixtures";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

async function openWithSamples(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "departments", exact: true })).toBeVisible();
}

async function openOverview(page: Page) {
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.getByRole("heading", { name: "Playground", level: 1 })).toBeVisible();
}

test.describe("Workspace overview", () => {
  test("shows sample catalog totals, searchable datasets, and the semantic model", async ({ page }) => {
    await openWithSamples(page);
    await openOverview(page);

    await expect(page.getByRole("heading", { name: "Playground", level: 1 })).toBeVisible();
    await expect(page.getByText("Rows in tables")).toBeVisible();
    await expect(page.getByText("16", { exact: true })).toBeVisible();

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
  });

  test("preview opens a runnable SQL tab and New query returns to the workbench", async ({ page }) => {
    await openWithSamples(page);
    await openOverview(page);

    await page.getByRole("button", { name: "Preview dataset employees" }).click();
    await expect(page.getByRole("tab", { name: "SQL", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: /Query 2/ })).toBeVisible();
    await expect(page.locator(".monaco-editor")).toContainText("employees");
    await expect(page.locator(".monaco-editor")).toContainText("LIMIT");
    await expect(page.getByRole("columnheader", { name: /emp_id/ })).toBeVisible({ timeout: 20_000 });

    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page.getByRole("heading", { name: "Playground", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "New query" }).click();
    await expect(page.getByRole("tab", { name: "SQL", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: /Query 3/ })).toBeVisible();
    await expect(page.locator(".monaco-editor")).toBeVisible();

    await page.locator(".monaco-editor").first().click();
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press("Delete");
    await page.keyboard.insertText("SELECT 9 AS answer");
    await page.getByRole("button", { name: /^Run/ }).click();
    await expect(page.getByRole("gridcell", { name: "9" })).toBeVisible({ timeout: 15_000 });
  });

  test("keeps the overview usable in both themes at a 390px viewport", async ({ page }) => {
    await openWithSamples(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openOverview(page);
    await page.getByRole("button", { name: "Dismiss" }).click();

    await expect(page.getByRole("heading", { name: "Playground", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Data catalog" })).toBeVisible();
    await page.screenshot({ path: "/tmp/querypad-overview-mobile.png", fullPage: true });

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
