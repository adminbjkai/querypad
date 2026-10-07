import { test, expect, type Page } from "./fixtures";

async function openWithSamples(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "departments", exact: true })).toBeVisible();
}

async function openHome(page: Page) {
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByRole("heading", { name: /What do you want to know/, level: 1 })).toBeVisible();
}

async function openEmployeesPage(page: Page) {
  await openHome(page);
  await page.getByRole("region", { name: "Data catalog" }).getByRole("button", { name: "employees Table" }).click();
  await expect(page.getByRole("heading", { name: "employees", level: 1 })).toBeVisible();
}

test.describe("Table page", () => {
  // DuckDB-Wasm starts slowly on a busy host; the first paint can exceed the default 30 s.
  test.describe.configure({ timeout: 60_000 });

  test("shows overview, preview and profile for a sample table", async ({ page }) => {
    await openWithSamples(page);
    await openEmployeesPage(page);

    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb).toContainText("Tables");
    await expect(breadcrumb).toContainText("employees");
    await expect(breadcrumb.getByRole("button", { name: "All tables" })).toBeVisible();

    const tabs = page.getByRole("tablist", { name: "employees sections" });
    await expect(tabs.getByRole("tab")).toHaveCount(3);
    await expect(tabs.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");

    // Overview: five columns, and the details rail knows the row count.
    const overview = page.getByRole("tabpanel");
    await expect(overview.getByText("5 columns", { exact: true })).toBeVisible();
    const details = page.getByRole("complementary", { name: "employees details" });
    await expect(details).toContainText("Rows12");
    await expect(details).toContainText("Columns5");
    await expect(details).toContainText("employees.csv");

    await page.screenshot({ path: "/tmp/lane-a-table-overview.png" });
    await page.getByLabel("Filter by name").fill("sal");
    await expect(overview.getByText("1 column", { exact: true })).toBeVisible();
    await page.getByLabel("Filter by name").fill("");

    // Preview: a grid with the 12 rows, without opening a SQL tab.
    await tabs.getByRole("tab", { name: "Preview" }).click();
    const grid = page.getByRole("grid");
    await expect(grid).toBeVisible({ timeout: 15_000 });
    await expect(grid).toHaveAttribute("aria-rowcount", "12");
    await expect(page.getByRole("columnheader", { name: /salary/ })).toBeVisible();

    // Keyboard moves between tabs.
    await tabs.getByRole("tab", { name: "Preview" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.getByRole("tab", { name: "Profile" })).toHaveAttribute("aria-selected", "true");

    // Profile: a card per column, including salary.
    await expect(page.getByText("Row count")).toBeVisible();
    const salaryCard = page.getByRole("listitem").filter({ hasText: "salary" }).first();
    await expect(salaryCard).toBeVisible({ timeout: 15_000 });
    await expect(salaryCard.getByText(/% empty/)).toBeVisible();
    await page.screenshot({ path: "/tmp/lane-a-table-profile.png" });

    // Query opens the workbench with SELECT * over the table.
    await page.getByRole("button", { name: "Query", exact: true }).click();
    await expect(page.getByRole("button", { name: "SQL", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("tab", { name: /Query 2/ })).toBeVisible();
    await expect(page.locator(".monaco-editor").first()).toContainText("employees");
  });

  test("breadcrumb and entry points route into the table page", async ({ page }) => {
    await openWithSamples(page);
    await openHome(page);
    await page.getByRole("button", { name: "Inspect dataset departments" }).click();
    await expect(page.getByRole("heading", { name: "departments", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tables", exact: true })).toHaveAttribute("aria-current", "page");

    // The "Tables" crumb goes back to the Tables page (the catalog).
    await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("button", { name: "All tables" }).click();
    await expect(page.getByRole("heading", { name: "Tables", level: 1 })).toBeVisible();

    // Explorer rows (the Tables panel beside SQL) open the page too.
    await page.getByRole("button", { name: "SQL", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "Tables panel" });
    if (!(await panel.isVisible())) await page.getByRole("button", { name: "Tables panel" }).click();
    await expect(panel).toBeVisible();
    await page.getByRole("button", { name: "Open employees" }).click({ force: true });
    await expect(page.getByRole("heading", { name: "employees", level: 1 })).toBeVisible();
  });

  test("the explorer's quick profile closes when the side panel changes", async ({ page }) => {
    await openWithSamples(page);
    await page.getByRole("button", { name: "Profile employees" }).click({ force: true });
    const drawer = page.getByRole("complementary", { name: "employees profile" });
    await expect(drawer).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "History", exact: true }).click();
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole("complementary", { name: "History panel" })).toBeVisible();
  });

  test("sample banner sits inline, dismisses per space, and Home shows quick actions", async ({ page }) => {
    await openWithSamples(page);
    const note = page.getByRole("note");
    await expect(note).toContainText("You're exploring two sample tables.");
    await expect(note.getByRole("button", { name: "Use my own data" })).toBeVisible();
    await expect(note).toHaveCSS("position", "static");

    await openHome(page);
    await expect(page.getByRole("region", { name: "Quick actions" }).getByRole("button")).toHaveCount(4);
    await page.screenshot({ path: "/tmp/lane-a-home.png" });

    await note.getByRole("button", { name: "Dismiss" }).click();
    await expect(note).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 55_000 });
    await expect(page.getByRole("note")).toHaveCount(0);
  });

  test("works at a phone width", async ({ page }) => {
    await openWithSamples(page);
    await page.setViewportSize({ width: 390, height: 844 });
    // The desktop load left the panel open; it now floats over the page.
    const panel = page.getByRole("complementary", { name: "Tables panel" });
    if (!(await panel.isVisible())) await page.getByRole("button", { name: "Tables panel" }).click();
    await expect(panel).toBeVisible();
    await page.screenshot({ path: "/tmp/lane-a-mobile.png" });
    await panel.getByRole("button", { name: "Close panel" }).click();
    await expect(panel).toHaveCount(0);

    await openHome(page);
    await page.getByRole("button", { name: "Inspect dataset employees" }).click();
    await expect(page.getByRole("heading", { name: "employees", level: 1 })).toBeVisible();
    await page.screenshot({ path: "/tmp/lane-a-mobile-table.png" });
  });
});
