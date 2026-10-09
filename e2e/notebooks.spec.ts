import { test, expect, type Page } from "./fixtures";

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const breadcrumb = (page: Page) => page.getByRole("navigation", { name: "Breadcrumb" });
const cell = (page: Page, n: number) => page.getByRole("region", { name: `Cell ${n}`, exact: true });

async function openWithSamples(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 30_000 });
}

async function openNotebooksList(page: Page) {
  await nav(page).getByRole("button", { name: "Notebooks", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Notebooks", level: 1 })).toBeVisible();
}

/** Replace a SQL cell's editor contents. */
async function typeSql(page: Page, n: number, sql: string) {
  const editor = cell(page, n).locator(".monaco-editor").first();
  await expect(editor).toBeVisible({ timeout: 20_000 });
  await editor.click();
  await page.keyboard.insertText(sql);
  await expect(editor).toContainText(sql.slice(0, 12));
}

test.describe("Notebooks", () => {
  // DuckDB-Wasm and Monaco both load lazily; the first notebook can take a while on a busy host.
  test.describe.configure({ timeout: 90_000 });

  test("create, run, annotate, persist and delete a notebook", async ({ page }) => {
    await openWithSamples(page);
    await openNotebooksList(page);
    await expect(page.getByText("No notebooks yet")).toBeVisible();

    // New notebook (the header action) opens the notebook page with its name in the breadcrumb and heading.
    await page.getByRole("banner").getByRole("button", { name: "New notebook" }).click();
    await expect(breadcrumb(page)).toContainText("Untitled notebook");
    await expect(page.getByRole("heading", { name: "Untitled notebook", level: 1 })).toBeVisible();
    await expect(page.getByText("1 cell", { exact: true })).toBeVisible();

    // Inline rename.
    await page.getByRole("heading", { level: 1 }).getByRole("button", { name: "Untitled notebook" }).click();
    const nameInput = page.getByRole("textbox", { name: "Notebook name" });
    await nameInput.fill("Analysis");
    await nameInput.press("Enter");
    await expect(page.getByRole("heading", { name: "Analysis", level: 1 })).toBeVisible();
    await expect(breadcrumb(page)).toContainText("Analysis");

    // Cell 1: Shift+Enter runs it and (as the last cell) adds a fresh SQL cell below.
    await typeSql(page, 1, "SELECT COUNT(*) AS n FROM employees");
    await page.keyboard.press("Shift+Enter");
    const result1 = page.getByRole("region", { name: "Result of cell 1" });
    await expect(result1).toBeVisible({ timeout: 30_000 });
    await expect(result1.getByRole("gridcell", { name: "12" })).toBeVisible();
    await expect(result1).toContainText("1 row");
    await expect(cell(page, 2)).toBeVisible();
    await expect(page.getByText("2 cells", { exact: true })).toBeVisible();

    // A text cell renders Markdown once editing is done.
    await page.getByRole("button", { name: "Add text cell", exact: true }).click();
    const notes = page.getByRole("textbox", { name: "Text for cell 3" });
    await expect(notes).toBeFocused();
    await notes.fill("## Notes\nCounts per **team**.");
    await page.getByRole("button", { name: "Done editing text for cell 3" }).click();
    await expect(cell(page, 3).getByRole("heading", { name: "Notes", level: 2 })).toBeVisible();
    await expect(cell(page, 3)).toContainText("Counts per team.");
    await expect(page.getByRole("textbox", { name: "Text for cell 3" })).toHaveCount(0);

    // Move the notes above the empty SQL cell through the cell menu.
    await cell(page, 3).getByRole("button", { name: "Cell 3 actions" }).click();
    await page.getByRole("menuitem", { name: "Move up" }).click();
    await expect(cell(page, 2)).toContainText("Notes");

    // A failing SQL cell shows the error card.
    await typeSql(page, 3, "SELECT nope FROM employees");
    await cell(page, 3).getByRole("button", { name: "Run cell 3" }).click();
    const error3 = cell(page, 3).getByRole("alert");
    await expect(error3).toBeVisible({ timeout: 30_000 });
    await expect(error3).toContainText("The query failed");
    await expect(error3).toContainText(/nope/);

    // Run all goes top to bottom and stops at the failing cell with a toast.
    await page.getByRole("button", { name: "Run all", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Run all stopped at cell 3" })).toBeVisible({ timeout: 30_000 });
    await expect(cell(page, 1).getByRole("region", { name: "Result of cell 1" })).toContainText("1 row");

    await page.screenshot({ path: "/tmp/lane-n4-notebook-light.png", fullPage: true });

    // Reload: the notebook and its three cells were saved; results are session-only.
    await page.waitForTimeout(1500);
    await page.reload();
    await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 30_000 });
    await openNotebooksList(page);
    const row = page.getByRole("list", { name: "Notebooks" }).getByRole("listitem").filter({ hasText: "Analysis" });
    await expect(row).toContainText("3 cells");
    await row.getByRole("button", { name: "Open notebook Analysis" }).click();
    await expect(page.getByRole("heading", { name: "Analysis", level: 1 })).toBeVisible();
    await expect(page.getByRole("list", { name: "Cells" }).getByRole("region", { name: /^Cell \d+$/ })).toHaveCount(3);
    await expect(cell(page, 1).locator(".monaco-editor").first()).toContainText("COUNT(*)", { timeout: 20_000 });
    await expect(cell(page, 2)).toContainText("Notes");
    await expect(cell(page, 3).locator(".monaco-editor").first()).toContainText("nope");
    await expect(page.getByRole("region", { name: "Result of cell 1" })).toHaveCount(0);

    // Dark theme render of the same notebook (through the real toggle, so the editors follow).
    await cell(page, 3).getByRole("button", { name: "Run cell 3" }).click();
    await expect(cell(page, 3).getByRole("alert")).toBeVisible({ timeout: 30_000 });
    await nav(page).getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.waitForTimeout(300);
    await page.screenshot({ path: "/tmp/lane-n4-notebook-dark.png", fullPage: true });
    await nav(page).getByRole("button", { name: "Switch to light theme" }).click();

    // Delete from the list's hover tray, confirmed in a dialog.
    await breadcrumb(page).getByRole("button", { name: "All notebooks" }).click();
    await row.hover();
    await row.getByRole("button", { name: "Delete Analysis" }).click();
    await page.getByRole("dialog", { name: "Delete notebook" }).getByRole("button", { name: "Confirm delete Analysis" }).click();
    await expect(page.getByText("No notebooks yet")).toBeVisible();
  });
});
