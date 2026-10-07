import { test, expect, type Page } from "./fixtures";

async function openWithSamples(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "departments", exact: true })).toBeVisible();
}

test.describe("Explorer extras", () => {
  // DuckDB-Wasm starts slowly on a busy host; the first paint can exceed the default 30 s.
  test.describe.configure({ timeout: 60_000 });

  test("hovering a table row shows a summary card with actions", async ({ page }) => {
    await openWithSamples(page);
    // The hover tray sits over the row's right half; point at the name on the left.
    await page.getByRole("button", { name: "employees", exact: true }).hover({ position: { x: 24, y: 12 } });
    const card = page.getByRole("dialog", { name: "employees summary" });
    await expect(card).toBeVisible();
    await expect(card).toContainText("12 rows");
    await expect(card).toContainText("5 columns");
    await expect(card).toContainText("employees.csv");
    await expect(card).toContainText("Loaded");
    await expect(card.getByRole("button", { name: "Open" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Preview" })).toBeVisible();
    // The row's own hover tray stays reachable while the card is open.
    await expect(page.getByRole("button", { name: "Profile employees" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card).toHaveCount(0);

    // Focusing the row shows it too.
    await page.getByRole("button", { name: "employees", exact: true }).focus();
    await expect(card).toBeVisible();
  });

  test("pinned tables sort first with a pin glyph and survive a reload", async ({ page }) => {
    await openWithSamples(page);
    const explorer = page.getByRole("complementary", { name: "Tables panel" });
    const items = explorer.getByRole("treeitem", { name: /^(employees|departments)$/ });
    await expect(items.first()).toHaveAttribute("aria-label", "employees");
    await page.getByRole("button", { name: "Pin departments" }).click({ force: true });
    await expect(items.first()).toHaveAttribute("aria-label", "departments");
    await expect(explorer.getByRole("treeitem", { name: "departments", exact: true }).getByLabel("pinned")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(items.first()).toHaveAttribute("aria-label", "departments");
    await page.getByRole("button", { name: "Unpin departments" }).click({ force: true });
    await expect(items.first()).toHaveAttribute("aria-label", "employees");
  });

  test("the explorer is a tree with groups, a details pane and keyboard navigation", async ({ page }) => {
    await openWithSamples(page);
    const explorer = page.getByRole("complementary", { name: "Tables panel" });
    const tree = explorer.getByRole("tree");
    await expect(tree.getByRole("treeitem", { name: "Tables", exact: true })).toContainText("2");
    // Columns are not listed inline; selecting a row opens the details pane with full types.
    await expect(explorer.getByTitle(/^Insert dept_id/)).toHaveCount(0);
    await explorer.getByRole("button", { name: "departments", exact: true }).click({ position: { x: 24, y: 12 } });
    const details = explorer.getByRole("region", { name: "departments details" });
    await expect(details).toContainText("4 rows");
    await expect(details.getByTitle(/^Insert dept_id/)).toBeVisible();
    // Resize with the keyboard.
    const sep = explorer.getByRole("separator", { name: "Resize details" });
    const before = Number(await sep.getAttribute("aria-valuenow"));
    await sep.focus();
    await page.keyboard.press("ArrowUp");
    expect(Number(await sep.getAttribute("aria-valuenow"))).toBe(before + 5);
    await details.getByRole("button", { name: "Close details" }).click();
    await expect(details).toHaveCount(0);

    // Arrow keys move through the tree; Enter opens the table page.
    await tree.getByRole("treeitem", { name: "employees", exact: true }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(tree.getByRole("treeitem", { name: "departments", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowLeft");
    await expect(tree.getByRole("treeitem", { name: "Tables", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(tree.getByRole("treeitem", { name: "employees", exact: true })).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
    await expect(tree.getByRole("treeitem", { name: "employees", exact: true })).toBeVisible();
  });

  test("search keeps matches, shows matching columns with counts, highlights and an Assistant row", async ({ page }) => {
    await openWithSamples(page);
    await page.getByLabel("Search tables and columns").fill("dept");
    const tree = page.getByRole("tree");
    const departments = tree.getByRole("treeitem", { name: "departments", exact: true });
    await expect(departments).toHaveAttribute("aria-expanded", "true");
    await expect(departments).toContainText("2 of 4 columns");
    const employees = tree.getByRole("treeitem", { name: "employees", exact: true });
    await expect(employees).toContainText("1 of 5 columns");
    await expect(page.getByTitle(/^Insert dept_id/)).toHaveCount(2);
    await expect(page.locator("mark").first()).toHaveText("dept");
    await expect(page.getByRole("button", { name: /Ask the Assistant about dept/ })).toBeVisible();
  });

  test("Add data lets each file pick its table name", async ({ page }) => {
    await openWithSamples(page);
    await page.getByRole("button", { name: "Add data" }).click();
    const dialog = page.getByRole("dialog", { name: "Add data" });
    await page.getByLabel("Choose data files").setInputFiles(["fixtures/data/users.csv"]);
    const name = dialog.getByLabel("Table name for users.csv");
    await expect(name).toHaveValue("users");
    await expect(dialog).toContainText("Supported formats");

    await name.fill("1bad name");
    await expect(dialog.getByText("Use letters, digits and underscores")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Load 1 file" })).toBeDisabled();

    await name.fill("people");
    await dialog.getByRole("button", { name: "Load 1 file" }).click();
    await expect(page.getByRole("button", { name: "people", exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "users", exact: true })).toHaveCount(0);
  });
});
