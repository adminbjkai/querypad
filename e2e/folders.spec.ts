import { test, expect, type Page } from "./fixtures";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

async function openWithSamples(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 30_000 });
}

async function typeSql(page: Page, sql: string) {
  await page.locator(".monaco-editor").first().click();
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(sql);
}

test.describe("Folders and saved queries", () => {
  test("saves a query into a new folder, reopens it from the folder, and lists it on Home", async ({ page }) => {
    await openWithSamples(page);

    // Write and run a query in a fresh tab so the first tab stays open when this one closes.
    await page.getByRole("button", { name: "New tab" }).click();
    await expect(page.getByRole("tab", { name: /Query 2/ })).toBeVisible();
    await typeSql(page, "SELECT count(*) AS headcount FROM employees");
    await page.getByRole("button", { name: /^Run/ }).click();
    await expect(page.getByRole("gridcell", { name: "12" })).toBeVisible({ timeout: 20_000 });

    // Save it: name "Headcount" in a new folder "Reports".
    await page.getByRole("toolbar", { name: "Editor tools" }).getByRole("button", { name: "Save query" }).click();
    const dialog = page.getByRole("dialog", { name: "Save query" });
    await dialog.getByRole("textbox", { name: "Query name" }).fill("Headcount");
    await dialog.getByRole("button", { name: "Folder" }).click();
    await page.getByRole("menuitemradio", { name: "New folder…" }).click();
    await dialog.getByRole("textbox", { name: "New folder name" }).fill("Reports");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toHaveCount(0);

    const savedTab = page.getByRole("tab", { name: /Headcount/ });
    await expect(savedTab).toBeVisible();
    await expect(savedTab.getByLabel("Saved query")).toBeVisible();
    await expect(savedTab.getByLabel("Unsaved changes")).toHaveCount(0);
    await page.getByRole("button", { name: "Close Headcount" }).click();
    await expect(page.getByRole("tab", { name: /Headcount/ })).toHaveCount(0);

    // The Folders page shows the folder with its one query.
    await page.getByRole("button", { name: "Folders", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Folders", level: 1 })).toBeVisible();
    const card = page.getByRole("button", { name: "Folder Reports", exact: true });
    await expect(card).toBeVisible();
    await expect(card).toContainText("1 query · 0 notebooks");

    // Inside the folder, Open brings the query back to the workbench with its SQL.
    await card.click();
    await expect(page.getByRole("heading", { name: "Reports", level: 1 })).toBeVisible();
    const row = page.getByRole("list", { name: "Items in Reports" }).getByRole("listitem").filter({ hasText: "Headcount" });
    await expect(row.getByRole("button", { name: "Query Headcount" })).toBeVisible();
    await expect(row.getByText("Query", { exact: true })).toBeVisible();
    await row.hover();
    await row.getByRole("button", { name: "Open Headcount" }).click();
    await expect(page.getByRole("button", { name: "SQL", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("tab", { name: /Headcount/ })).toBeVisible();
    await expect(page.locator(".monaco-editor")).toContainText("headcount");
    await expect(page.locator(".monaco-editor")).toContainText("employees");

    // Editing marks the tab as changed; Ctrl/⌘+S in the editor saves silently.
    await page.locator(".monaco-editor").first().click();
    await page.keyboard.press("End");
    await page.keyboard.insertText(" -- v2");
    const reopened = page.getByRole("tab", { name: /Headcount/ });
    await expect(reopened.getByLabel("Unsaved changes")).toBeVisible();
    await page.keyboard.press(`${MOD}+s`);
    await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
    await expect(reopened.getByLabel("Unsaved changes")).toHaveCount(0);

    // Rename the folder, then delete it: the query becomes unfiled.
    await page.getByRole("button", { name: "Folders", exact: true }).click();
    await page.getByRole("button", { name: "Rename folder Reports" }).click();
    const rename = page.getByRole("dialog", { name: "Rename folder" });
    await rename.getByRole("textbox", { name: "Folder name" }).fill("Monthly reports");
    await rename.getByRole("button", { name: "Rename" }).click();
    await expect(page.getByRole("button", { name: "Folder Monthly reports", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Delete folder Monthly reports" }).click();
    await page.getByRole("dialog", { name: "Delete folder?" }).getByRole("button", { name: "Delete folder" }).click();
    await expect(page.getByRole("button", { name: "Folder Monthly reports", exact: true })).toHaveCount(0);
    const unfiled = page.getByRole("region", { name: "Unfiled" });
    await expect(unfiled.getByRole("button", { name: "Query Headcount" })).toBeVisible();

    // Home › Recent › Queries lists the saved query first.
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page.getByRole("tab", { name: "Queries" }).click();
    const queries = page.getByRole("tabpanel", { name: "Queries" });
    await expect(queries.getByRole("listitem").first().getByRole("button", { name: "Saved query Headcount" })).toBeVisible();
    await expect(queries.getByRole("listitem").nth(1)).toContainText("headcount");
  });
});
