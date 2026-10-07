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

  test("pinned tables sit in a Pinned group and survive a reload", async ({ page }) => {
    await openWithSamples(page);
    await page.getByRole("button", { name: "Pin employees" }).click({ force: true });
    const explorer = page.getByRole("complementary", { name: "Tables panel" });
    await expect(explorer.getByText("Pinned", { exact: true })).toBeVisible();
    // The section label (text "Pinned" + its count pill) is followed by the pinned rows.
    const pinnedGroup = explorer.locator("div.flex", { hasText: /^Pinned1$/ }).locator("xpath=following-sibling::*[1]");
    await expect(pinnedGroup.getByRole("button", { name: "employees", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "employees", exact: true })).toHaveCount(1);

    await page.reload();
    await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(explorer.getByText("Pinned", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Unpin employees" }).click({ force: true });
    await expect(explorer.getByText("Pinned", { exact: true })).toHaveCount(0);
  });

  test("search keeps matches expanded with column counts, highlights and an Assistant row", async ({ page }) => {
    await openWithSamples(page);
    await page.getByLabel("Search tables and columns").fill("dept");
    const departments = page.getByRole("button", { name: "departments", exact: true });
    await expect(departments).toHaveAttribute("aria-expanded", "true");
    await expect(departments).toContainText("2 of 4 columns");
    const employees = page.getByRole("button", { name: "employees", exact: true });
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
