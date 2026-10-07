import { test, expect, type Page } from "./fixtures";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

async function openWithSamples(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 30_000 });
}

async function runSample(page: Page) {
  await page.getByRole("button", { name: /^Run/ }).click();
  await expect(page.getByRole("columnheader", { name: /dept_name/ })).toBeVisible({ timeout: 15_000 });
}

/** Replace the editor contents of the active tab and run it. */
async function runSql(page: Page, sql: string) {
  await page.locator(".monaco-editor").first().click();
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(sql);
  await page.getByRole("button", { name: /^Run/ }).click();
}

test.describe("Results extras", () => {
  test("column menu, sort chip, column selection, column card, query details and column chooser", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openWithSamples(page);
    await runSample(page);

    // Column ⋮ menu: Copy column name comes first and copies the name.
    await page.getByRole("button", { name: "Menu for dept_name" }).click();
    const menu = page.getByRole("menu", { name: "Column dept_name" });
    const items = menu.getByRole("menuitem");
    await expect(items.first()).toHaveText("Copy column name");
    await expect(menu.getByRole("menuitem", { name: /column stats/ })).toBeVisible();
    await items.first().click();
    await expect(page.getByText("Copied dept_name")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("dept_name");

    // A header click sorts (chip appears) and selects the column (footer shows its count).
    const header = page.getByRole("columnheader", { name: /dept_name/ }).getByText("dept_name", { exact: true });
    await header.click();
    const chip = page.getByText("dept_name ASC");
    await expect(chip).toBeVisible();
    const firstCell = page.getByRole("row").nth(1).getByRole("gridcell").first();
    await expect(firstCell).toHaveText("Design");
    const footer = page.getByTestId("grid-footer");
    await expect(footer).toContainText("Count 4");
    await page.getByRole("button", { name: "Clear sort" }).click();
    await expect(chip).toHaveCount(0);
    await expect(firstCell).toHaveText("Engineering");

    // The stats block opens the column card; a top-value chip applies the grid filter.
    await page.getByRole("button", { name: "Show stats for dept_name" }).click();
    const card = page.getByRole("dialog", { name: "Column card for dept_name" });
    await expect(card).toBeVisible();
    await expect(card.getByText("Distinct")).toBeVisible();
    await expect(card.getByText("filled")).toBeVisible();
    await card.getByRole("button", { name: "Show rows with this value: Marketing" }).click();
    await expect(card).toHaveCount(0);
    await expect(page.getByLabel("Filter rows")).toHaveValue("Marketing");
    await expect(page.getByRole("row")).toHaveCount(2); // header + Marketing
    await page.getByLabel("Filter rows").fill("");

    // Numeric column card shows Sum/Average and the key/join section for a mapped column.
    await page.getByRole("button", { name: "Show stats for avg_salary" }).click();
    const numCard = page.getByRole("dialog", { name: "Column card for avg_salary" });
    await expect(numCard.getByText("Sum")).toBeVisible();
    await expect(numCard.getByText("Average")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(numCard).toHaveCount(0);

    // Query details popover.
    const details = page.getByRole("button", { name: "Query details" });
    await expect(details).toContainText("4 rows");
    await details.click();
    const pop = page.getByRole("dialog", { name: "Query details" });
    await expect(pop.getByText("Rows")).toBeVisible();
    await expect(pop.getByText("Total")).toBeVisible();
    await expect(pop.getByText(/FROM employees e/)).toBeVisible();
    await expect(pop.getByText("Ran at")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(pop).toHaveCount(0);

    // Choose columns: unchecking avg_salary removes its header.
    await page.getByRole("button", { name: "Choose columns" }).click();
    const dialog = page.getByRole("dialog", { name: "Choose columns" });
    await dialog.getByLabel("Search columns").fill("avg");
    await dialog.getByRole("checkbox", { name: "avg_salary" }).uncheck();
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("columnheader", { name: /avg_salary/ })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: /headcount/ })).toBeVisible();
    await expect(details).toContainText("2 columns of 3");
  });

  test("Next steps offers a verified join when relationships exist and opens it in a new tab", async ({ page }) => {
    await openWithSamples(page);
    await runSql(page, "SELECT emp_id, name FROM employees ORDER BY emp_id LIMIT 5");
    await expect(page.getByRole("columnheader", { name: /emp_id/ })).toBeVisible({ timeout: 15_000 });
    // Discovery runs after the sample loads; the Joins panel's count tells us it finished.
    await page.getByRole("button", { name: "Next steps" }).click();
    const pop = page.getByRole("dialog", { name: "Next steps" });
    const join = pop.getByRole("button", { name: /^Join employees ↔ departments on dept_id/ });
    await expect(join).toBeVisible({ timeout: 20_000 });
    await expect(pop.getByRole("button", { name: "Group name and count" })).toBeVisible();
    await expect(pop.getByRole("button", { name: "Profile employees" })).toBeVisible();
    const tabsBefore = await page.getByRole("tab", { name: /^Query \d+|Join/ }).count();
    await join.click();
    await expect(page.locator(".monaco-editor")).toContainText("JOIN", { timeout: 10_000 });
    await expect(page.getByRole("columnheader", { name: /dept_name/ })).toBeVisible({ timeout: 15_000 });
    expect(await page.getByRole("tab", { name: /^Query \d+|Join/ }).count()).toBeGreaterThan(tabsBefore);
  });
});
