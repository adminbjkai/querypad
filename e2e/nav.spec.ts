import { test, expect, type Page } from "./fixtures";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

async function openWithSamples(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "departments", exact: true })).toBeVisible();
}

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const breadcrumb = (page: Page) => page.getByRole("navigation", { name: "Breadcrumb" });

test.describe("Navigation", () => {
  test.describe.configure({ timeout: 60_000 });

  test("the rail shows Workspace, Data and Library groups with their items", async ({ page }) => {
    await openWithSamples(page);
    const groups: [string, string[]][] = [
      ["Workspace", ["Home", "Agent", "SQL", "Notebooks", "Pipelines"]],
      ["Data", ["Tables", "Joins"]],
      ["Library", ["Folders", "Snippets", "History"]],
    ];
    for (const [label, items] of groups) {
      const group = nav(page).getByRole("group", { name: label });
      await expect(group.getByRole("button")).toHaveCount(items.length);
      for (const [i, item] of items.entries()) await expect(group.getByRole("button").nth(i)).toHaveAccessibleName(item);
    }
    // Pages carry aria-current, panels aria-pressed.
    await expect(nav(page).getByRole("button", { name: "SQL", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(nav(page).getByRole("button", { name: "Joins", exact: true })).toHaveAttribute("aria-pressed", "false");
  });

  test("Tables opens the catalog page and a row opens the table page", async ({ page }) => {
    await openWithSamples(page);
    await nav(page).getByRole("button", { name: "Tables", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tables", level: 1 })).toBeVisible();
    await expect(nav(page).getByRole("button", { name: "Tables", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(breadcrumb(page)).toContainText("Tables");
    await expect(page.getByText("2 tables")).toBeVisible();
    const catalog = page.getByRole("region", { name: "Data catalog" });
    await expect(catalog.getByRole("row", { name: /employees/ })).toBeVisible();
    await expect(catalog.getByRole("row", { name: /departments/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add data" })).toBeVisible();

    await catalog.getByRole("button", { name: "departments Table" }).click();
    await expect(page.getByRole("heading", { name: "departments", level: 1 })).toBeVisible();
    await expect(breadcrumb(page).getByRole("button", { name: "All tables" })).toBeVisible();
    await expect(breadcrumb(page)).toContainText("departments");
    await expect(nav(page).getByRole("button", { name: "Tables", exact: true })).toHaveAttribute("aria-current", "page");
  });

  test("the Tables panel toggles with the header button and the keyboard in SQL", async ({ page }) => {
    await openWithSamples(page);
    const panel = page.getByRole("complementary", { name: "Tables panel" });
    const toggle = page.getByRole("button", { name: "Tables panel" });
    await expect(panel).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    await page.locator("body").press(`${MOD}+b`);
    await expect(panel).toHaveCount(0);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await toggle.click();
    await expect(panel).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    // The Tables page has no side panel, and no toggle for it.
    await nav(page).getByRole("button", { name: "Tables", exact: true }).click();
    await expect(toggle).toHaveCount(0);
    await expect(panel).toHaveCount(0);
  });

  test("New ▾ creates and opens a notebook", async ({ page }) => {
    await openWithSamples(page);
    await nav(page).getByRole("button", { name: "Other ways to start" }).click();
    await page.getByRole("menuitem", { name: "New notebook" }).click();
    await expect(breadcrumb(page).getByRole("button", { name: "All notebooks" })).toBeVisible();
    await expect(breadcrumb(page)).toContainText(/notebook/i);
    await expect(nav(page).getByRole("button", { name: "Notebooks", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("button", { name: "New notebook" })).toBeVisible();

    // The list shows the new notebook and the count reaches the rail.
    await breadcrumb(page).getByRole("button", { name: "All notebooks" }).click();
    await expect(breadcrumb(page)).toContainText("Notebooks");
    await expect(nav(page).getByRole("button", { name: "Notebooks", exact: true })).toContainText("1");
  });

  test("Folders and Agent pages open from the rail", async ({ page }) => {
    await openWithSamples(page);
    await nav(page).getByRole("button", { name: "Folders", exact: true }).click();
    await expect(nav(page).getByRole("button", { name: "Folders", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(breadcrumb(page)).toContainText("Folders");
    await expect(page.getByRole("button", { name: "New folder" })).toBeVisible();

    await nav(page).getByRole("button", { name: "Agent", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Agent", level: 1 })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Ask the agent" })).toBeVisible();
    await expect(breadcrumb(page)).toContainText("Agent");
  });

  test("G-chords and the palette navigate between pages", async ({ page }) => {
    await openWithSamples(page);
    await page.locator("body").press("g");
    await page.locator("body").press("t");
    await expect(page.getByRole("heading", { name: "Tables", level: 1 })).toBeVisible();
    await page.locator("body").press("g");
    await page.locator("body").press("h");
    await expect(nav(page).getByRole("button", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");

    await page.locator("body").press(`${MOD}+p`);
    await page.getByRole("combobox", { name: "Search commands" }).fill("go to agent");
    await page.getByRole("option", { name: /Go to Agent/ }).click();
    await expect(page.getByRole("heading", { name: "Agent", level: 1 })).toBeVisible();
  });

  test("the collapsed rail keeps the current page marked and shows shortcuts", async ({ page }) => {
    await openWithSamples(page);
    await nav(page).getByRole("button", { name: "Tables", exact: true }).click();
    await nav(page).getByRole("button", { name: "Collapse navigation" }).click();
    await expect(nav(page).getByText("Library")).toHaveCount(0);
    const tables = nav(page).getByRole("button", { name: "Tables", exact: true });
    await expect(tables).toHaveAttribute("aria-current", "page");
    await expect(tables).toHaveAttribute("title", "Tables (G T)");
    await expect(nav(page).getByRole("button", { name: "Agent", exact: true })).toHaveAttribute("title", "Agent (G A)");
    await nav(page).getByRole("button", { name: "Expand navigation" }).click();
    await expect(nav(page).getByText("Library")).toBeVisible();
  });
});
