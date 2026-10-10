import { test, expect, isolate, type Page, type Route } from "./fixtures";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

async function openWithSamples(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 30_000 });
}

/** Replace the editor contents of the active tab and run it. */
async function runSql(page: Page, sql: string) {
  await page.locator(".monaco-editor").first().click();
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(sql);
  await page.getByRole("button", { name: /^Run/ }).click();
}

test.describe("Run the statement at the cursor", () => {
  test("Ctrl/⌘+Shift+Enter runs only the statement under the cursor", async ({ page }) => {
    await openWithSamples(page);
    await page.locator(".monaco-editor").first().click();
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press("Delete");
    await page.keyboard.insertText("SELECT 'x;y' AS first_col;\nSELECT 2 AS second_col");
    // Cursor on the first line: only the first statement runs (the ; in the string doesn't split it).
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press(`${MOD}+Shift+Enter`);
    await expect(page.getByRole("columnheader", { name: /first_col/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("columnheader", { name: /second_col/ })).toHaveCount(0);
    // Ctrl/⌘+Enter still runs the whole tab (the last statement's result shows).
    await page.keyboard.press(`${MOD}+Enter`);
    await expect(page.getByRole("columnheader", { name: /second_col/ })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("SQL-created tables and views", () => {
  test("CREATE TABLE shows in the sidebar, persists, and DROP removes it", async ({ page }) => {
    await openWithSamples(page);
    await runSql(
      page,
      "CREATE TABLE employee_bio AS SELECT emp_id, 'Bio of ' || name AS bio FROM employees WHERE emp_id <= 5"
    );
    const bio = page.getByRole("button", { name: "employee_bio", exact: true });
    await expect(bio).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("3 tables")).toBeVisible();

    // Inserting more rows updates the row count shown in the tree.
    await runSql(page, "INSERT INTO employee_bio VALUES (6, 'late addition')");
    await expect(bio).toContainText("6");

    // The table survives a reload (it was saved as a snapshot) and joins are discovered for it.
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.getByRole("button", { name: "employee_bio", exact: true })).toBeVisible({ timeout: 30_000 });
    await runSql(page, "SELECT COUNT(*) AS n FROM employee_bio");
    await expect(page.getByRole("gridcell", { name: "6" })).toBeVisible({ timeout: 10_000 });

    await runSql(page, "DROP TABLE employee_bio");
    await expect(page.getByRole("button", { name: "employee_bio", exact: true })).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText("2 tables")).toBeVisible();
  });

  test("an empty CREATE TABLE … WHERE FALSE shows up, gets its join, and the keys know it", async ({ page }) => {
    await openWithSamples(page);
    await runSql(
      page,
      `CREATE TABLE employee_bio AS
SELECT
    emp_id,
    CAST(NULL AS VARCHAR) AS birth_country,
    CAST(NULL AS VARCHAR) AS birth_state,
    CAST(NULL AS DATE) AS birth_date,
    CAST(NULL AS VARCHAR) AS education_level
FROM employees
WHERE FALSE;`
    );
    await expect(page.getByRole("button", { name: "employee_bio", exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("3 tables")).toBeVisible();

    await page.getByRole("button", { name: "Joins", exact: true }).click();
    await expect(page.getByText("employee_bio.emp_id")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("name match")).toBeVisible();

    await runSql(page, "SELECT table_name, key_type FROM querypad.keys WHERE table_name = 'employee_bio'");
    await expect(page.getByRole("gridcell", { name: "foreign key" })).toBeVisible({ timeout: 10_000 });
  });

  test("CREATE VIEW shows as a view and survives a reload", async ({ page }) => {
    await openWithSamples(page);
    await runSql(
      page,
      "CREATE VIEW staff AS SELECT e.name, d.dept_name FROM employees e JOIN departments d ON e.dept_id = d.dept_id"
    );
    const view = page.getByRole("button", { name: "staff", exact: true });
    await expect(view).toBeVisible({ timeout: 15_000 });
    await expect(view).toContainText("view");
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.getByRole("button", { name: "staff", exact: true })).toBeVisible({ timeout: 30_000 });
    await runSql(page, "SELECT COUNT(*) AS n FROM staff");
    await expect(page.getByRole("gridcell", { name: "12" })).toBeVisible({ timeout: 10_000 });
  });

  test("inferred keys are queryable with SQL", async ({ page }) => {
    await openWithSamples(page);
    await page.getByRole("button", { name: "Joins", exact: true }).click();
    await expect(page.getByText(/inferred from your data/)).toBeVisible({ timeout: 20_000 });
    await runSql(page, "SELECT table_name, column_name, key_type, references_table FROM querypad.keys ORDER BY table_name");
    await expect(page.getByRole("gridcell", { name: "primary key" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("gridcell", { name: "foreign key" })).toBeVisible();
    // Internal tables never show up as user tables.
    await page.getByRole("button", { name: "Tables", exact: true }).click();
    await expect(page.getByText("2 tables in this space")).toBeVisible();
  });
});

test.describe("Spaces", () => {
  test("save, switch, start fresh from the template, rename and delete", async ({ page }) => {
    await openWithSamples(page);
    await expect(page.getByRole("button", { name: /^Space: Playground/ })).toBeVisible();

    // Make this space distinctive, then save a copy of it as "Analysis".
    await runSql(page, "CREATE TABLE notes AS SELECT 1 AS id, 'keep me' AS note");
    await expect(page.getByRole("button", { name: "notes", exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /^Space: / }).click();
    await page.getByRole("button", { name: /Save as new space/ }).click();
    await page.getByLabel("New space name").fill("Analysis");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("dialog", { name: "Spaces" })).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: /^Space: Analysis/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "notes", exact: true })).toBeVisible();

    // Changes in Analysis don't leak into Playground.
    await runSql(page, "DROP TABLE notes");
    await expect(page.getByRole("button", { name: "notes", exact: true })).toHaveCount(0, { timeout: 10_000 });
    await page.getByRole("button", { name: /^Space: / }).click();
    await page.getByRole("button", { name: /^Playground/ }).click();
    await expect(page.getByRole("button", { name: /^Space: Playground/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "notes", exact: true })).toBeVisible({ timeout: 15_000 });

    // A fresh space from the sample template has just the two sample tables.
    await page.getByRole("button", { name: /^Space: / }).click();
    await page.getByRole("button", { name: /New space from sample data/ }).click();
    await page.getByLabel("New space name").fill("Fresh");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("dialog", { name: "Spaces" })).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: /^Space: Fresh/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "notes", exact: true })).toHaveCount(0);

    // An empty space shows the start screen.
    await page.getByRole("button", { name: /^Space: / }).click();
    await page.getByRole("button", { name: /New empty space/ }).click();
    await page.getByLabel("New space name").fill("Blank");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("dialog", { name: "Spaces" })).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByText("Drop in your data files.")).toBeVisible({ timeout: 15_000 });

    // Rename and delete from the menu; the active space survives a reload.
    await page.getByRole("button", { name: /^Space: / }).click();
    await page.getByRole("button", { name: "Rename Fresh" }).click({ force: true });
    await page.getByLabel("Space name").fill("Fresh copy");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Fresh copy/ })).toBeVisible();
    await page.getByRole("button", { name: "Delete Blank" }).click({ force: true });
    await page.getByRole("button", { name: "Confirm delete Blank" }).click();
    await expect(page.getByRole("button", { name: /^Space: (Playground|Analysis|Fresh copy)/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Deleted Blank.")).toBeVisible();

    await page.getByRole("button", { name: /^Space: / }).click();
    await expect(page.getByRole("button", { name: /^Analysis/ })).toBeVisible();
    await page.getByRole("button", { name: /^Analysis/ }).click();
    await expect(page.getByRole("button", { name: /^Space: Analysis/ })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.getByRole("button", { name: /^Space: Analysis/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "notes", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible();
  });
});

test.describe("Saved on the server", () => {
  test("two devices see the same workspace, live and after reload", async ({ browser }) => {
    test.setTimeout(150_000);
    const ctxA = await browser.newContext();
    const ns = await isolate(ctxA);
    const a = await ctxA.newPage();
    await openWithSamples(a);
    await a.waitForTimeout(800);

    // A second device (fresh browser storage, same account) opens the same space.
    const ctxB = await browser.newContext();
    await isolate(ctxB, ns);
    const b = await ctxB.newPage();
    await openWithSamples(b);
    await expect(b.getByRole("button", { name: /^Space: Playground/ })).toBeVisible();

    // Editor text typed on A shows up on B without reloading.
    await a.locator(".monaco-editor").click();
    await a.keyboard.press(`${MOD}+End`);
    await a.keyboard.type("\n-- typed on device A");
    await expect(b.locator(".monaco-editor")).toContainText("typed on device A", { timeout: 15_000 });

    // Tables created on A appear on B.
    await runSql(a, "CREATE TABLE synced AS SELECT 7 AS n");
    await expect(a.getByRole("button", { name: "synced", exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(b.getByRole("button", { name: "synced", exact: true })).toBeVisible({ timeout: 20_000 });

    // New spaces show up in B's space list.
    await a.getByRole("button", { name: /^Space: / }).click();
    await a.getByRole("button", { name: /New empty space/ }).click();
    await a.getByLabel("New space name").fill("From A");
    await a.getByRole("button", { name: "Create" }).click();
    await expect(a.getByRole("dialog", { name: "Spaces" })).toHaveCount(0, { timeout: 20_000 });
    await expect(a.getByRole("button", { name: /^Space: From A/ })).toBeVisible({ timeout: 15_000 });
    await a.waitForTimeout(800);
    await b.getByRole("button", { name: /^Space: / }).click();
    await expect(b.getByRole("button", { name: /^From A/ })).toBeVisible({ timeout: 15_000 });
    await b.keyboard.press("Escape");

    // A brand-new browser on the same account loads everything from the server.
    const ctxC = await browser.newContext();
    await isolate(ctxC, ns);
    const c = await ctxC.newPage();
    await c.goto("/");
    await expect(c.getByRole("button", { name: /^Space: From A/ })).toBeVisible({ timeout: 30_000 });
    await c.getByRole("button", { name: /^Space: / }).click();
    await c.getByRole("dialog", { name: "Spaces" }).getByRole("button", { name: /^Playground/ }).click();
    await expect(c.getByRole("button", { name: "synced", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(c.locator(".monaco-editor")).toContainText("CREATE TABLE synced");

    // Deleting on B the space A has open moves A elsewhere, and the space stays gone
    // even though A and C keep saving with their older space lists.
    await b.getByRole("button", { name: /^Space: / }).click();
    await b.getByRole("button", { name: "Delete From A" }).click({ force: true });
    await b.getByRole("button", { name: "Confirm delete From A" }).click();
    await expect(a.getByRole("button", { name: /^Space: Playground/ })).toBeVisible({ timeout: 20_000 });
    await runSql(c, "SELECT 1 AS after_delete");
    await a.waitForTimeout(4000);
    for (const p of [a, b, c]) {
      await p.reload();
      await expect(p.getByRole("button", { name: /^Space: / })).toBeVisible({ timeout: 30_000 });
      await p.getByRole("button", { name: /^Space: / }).click();
      await expect(p.getByRole("button", { name: /^Playground/ })).toBeVisible();
      await expect(p.getByRole("button", { name: /^From A/ })).toHaveCount(0);
      await p.keyboard.press("Escape");
    }

    await ctxA.close();
    await ctxB.close();
    await ctxC.close();
  });
});

test.describe("Snippet library", () => {
  async function setEditor(page: Page, sql: string) {
    await page.locator(".monaco-editor").first().click();
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press("Delete");
    await page.keyboard.insertText(sql);
  }

  test("save, insert, run, edit, search and delete snippets — shared across devices", async ({ browser }) => {
    test.setTimeout(120_000);
    const ctxA = await browser.newContext();
    const ns = await isolate(ctxA);
    const a = await ctxA.newPage();
    await openWithSamples(a);

    // Save the editor's SQL with the shortcut.
    await setEditor(a, "SELECT dept_name, budget FROM departments ORDER BY budget DESC");
    await a.keyboard.press(`${MOD}+Shift+S`);
    const dialog = a.getByRole("dialog", { name: "Save snippet" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Snippet SQL")).toHaveValue(/ORDER BY budget DESC/);
    await dialog.getByLabel("Snippet name").fill("Biggest budgets");
    await dialog.getByRole("button", { name: "Snippet folder" }).click();
    await a.getByRole("menuitemradio", { name: "New folder…" }).click();
    await dialog.getByLabel("New folder name").fill("Reports");
    await dialog.getByLabel("Snippet description").fill("Departments by budget");
    await dialog.getByRole("button", { name: "Save snippet" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(a.getByRole("button", { name: "Snippets", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(a.getByRole("region", { name: "Folder Reports" })).toBeVisible();
    await expect(a.getByRole("button", { name: "Snippet Biggest budgets" })).toBeVisible();

    // Clicking inserts at the cursor; "Run" opens it in a named tab and runs it.
    await a.getByRole("button", { name: "New tab" }).click();
    await a.getByRole("button", { name: "Snippet Biggest budgets" }).click();
    await expect(a.locator(".monaco-editor")).toContainText("ORDER BY budget DESC");
    await a.getByRole("button", { name: "Snippet Biggest budgets" }).hover();
    await a.getByRole("button", { name: "Run Biggest budgets" }).click();
    await expect(a.getByRole("tab", { name: /Biggest budgets/ })).toBeVisible();
    await expect(a.getByRole("columnheader", { name: /budget/ })).toBeVisible({ timeout: 15_000 });

    // A second device sees it without reloading.
    const ctxB = await browser.newContext();
    await isolate(ctxB, ns);
    const b = await ctxB.newPage();
    await openWithSamples(b);
    await b.getByRole("button", { name: "Snippets", exact: true }).click();
    await expect(b.getByRole("button", { name: "Snippet Biggest budgets" })).toBeVisible({ timeout: 15_000 });

    // Edit on A (rename); B picks it up live.
    await a.getByRole("button", { name: "Snippet Biggest budgets" }).hover();
    await a.getByRole("button", { name: "More for Biggest budgets" }).click();
    await a.getByRole("menuitem", { name: "Edit" }).click();
    const edit = a.getByRole("dialog", { name: "Edit snippet" });
    await edit.getByLabel("Snippet name").fill("Top budgets");
    await edit.getByRole("button", { name: "Save changes" }).click();
    await expect(a.getByRole("button", { name: "Snippet Top budgets" })).toBeVisible();
    await expect(b.getByRole("button", { name: "Snippet Top budgets" })).toBeVisible({ timeout: 15_000 });

    // Search, then the command palette.
    await a.getByRole("complementary", { name: "Snippets panel" }).getByRole("button", { name: "Save as snippet" }).click();
    const second = a.getByRole("dialog", { name: "Save snippet" });
    await second.getByLabel("Snippet name").fill("Headcount");
    await second.getByRole("button", { name: "Save snippet" }).click();
    await a.getByLabel("Search snippets").fill("reports");
    await expect(a.getByRole("button", { name: "Snippet Headcount" })).toHaveCount(0);
    await expect(a.getByRole("button", { name: "Snippet Top budgets" })).toBeVisible();
    await a.getByLabel("Search snippets").fill("");
    await a.keyboard.press(`${MOD}+p`);
    await a.getByLabel("Search commands").fill("insert snippet top");
    await expect(a.getByRole("option", { name: /Insert snippet Top budgets/ })).toBeVisible();
    await a.keyboard.press("Escape");

    // Delete on B; A's library follows, and it stays gone after reload.
    await b.getByRole("button", { name: "Snippet Top budgets" }).hover();
    await b.getByRole("button", { name: "More for Top budgets" }).click();
    await b.getByRole("menuitem", { name: "Delete" }).click();
    await b.getByRole("dialog", { name: "Delete snippet" }).getByRole("button", { name: "Confirm delete Top budgets" }).click();
    await expect(b.getByRole("button", { name: "Snippet Top budgets" })).toHaveCount(0);
    await expect(a.getByRole("button", { name: "Snippet Top budgets" })).toHaveCount(0, { timeout: 15_000 });
    await a.reload();
    await expect(a.getByRole("button", { name: /^Space: / })).toBeVisible({ timeout: 30_000 });
    await a.getByRole("button", { name: "Snippets", exact: true }).click();
    await expect(a.getByRole("button", { name: "Snippet Headcount" })).toBeVisible({ timeout: 15_000 });
    await expect(a.getByRole("button", { name: "Snippet Top budgets" })).toHaveCount(0);

    await ctxA.close();
    await ctxB.close();
  });
});

test.describe("Assistant panel", () => {
  test("answers in the chat after looking at the data; collapses and resizes", async ({ page }) => {
    const bodies: { provider: string; effort?: string; input: string; system: string }[] = [];
    const replies = [
      "Let me count them.\n```sql-run\nSELECT COUNT(*) AS n FROM employees\n```",
      "There are **12** employees.\n\n```sql\nSELECT COUNT(*) FROM employees\n```",
    ];
    await page.route("**/api/complete", async (route: Route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: { providers: ["local-claude"] } });
        return;
      }
      bodies.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: "text/plain", body: replies[bodies.length - 1] ?? "Done." });
    });

    await openWithSamples(page);
    await page.keyboard.press(`${MOD}+i`);
    const panel = page.getByRole("complementary", { name: "Assistant" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { name: "AI model" })).toContainText("Sonnet 5.5");
    await panel.getByLabel("Message the assistant").fill("How many employees are there?");
    await panel.getByLabel("Message the assistant").press("Enter");

    // The read-only lookup ran automatically and its result went back to the model.
    await expect(panel.getByText("There are")).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByRole("button", { name: /Looked at the data · 1 rows/ })).toBeVisible();
    expect(bodies).toHaveLength(2);
    expect(bodies[0].provider).toBe("local-claude");
    expect(bodies[0].effort).toBe("low");
    expect(bodies[0].input).toContain("## Open tabs");
    expect(bodies[0].input).toContain("User: How many employees are there?");
    expect(bodies[1].input).toContain("QueryPad ran your sql-run query (1 rows");
    expect(bodies[1].input).toMatch(/n\n12/);

    // Answer-only: SQL comes as a copyable block, nothing to apply; the editor is untouched.
    await expect(panel.getByRole("button", { name: "Copy SQL" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Apply" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: /Query 1/ })).toBeVisible();
    expect(bodies[0].system).not.toContain("App actions");

    // Resize by dragging the left edge (the side panel is hidden first: the editor
    // column keeps a 320px floor, so at 1280px wide the Assistant could not grow otherwise).
    await page.keyboard.press(`${MOD}+b`);
    const before = (await panel.boundingBox())!.width;
    const handle = panel.getByRole("separator", { name: "Resize assistant" });
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x - 120, box.y + 200, { steps: 6 });
    await page.mouse.up();
    expect((await panel.boundingBox())!.width).toBeGreaterThan(before + 80);

    // Collapse to the rail and back.
    await panel.getByRole("button", { name: "Collapse assistant" }).click();
    await expect(panel).toHaveCount(0);
    await page.getByRole("button", { name: "Open assistant" }).click();
    await expect(page.getByRole("complementary", { name: "Assistant" })).toBeVisible();

    // The conversation is kept for this space.
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.getByRole("complementary", { name: "Assistant" }).getByText("There are")).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("Search", () => {
  test("finds columns and inserts them", async ({ page }) => {
    await openWithSamples(page);
    await page.getByRole("button", { name: "New tab" }).click();
    await page.keyboard.press(`${MOD}+p`);
    await page.getByLabel("Search commands").fill("hire_date");
    await page.getByRole("option", { name: /employees\.hire_date/ }).click();
    await expect(page.locator(".monaco-editor")).toContainText("hire_date");
  });
});

test.describe("Charts", () => {
  test("builds a chart with aggregation and switches types", async ({ page }) => {
    await openWithSamples(page);
    await runSql(page, "SELECT d.dept_name, e.salary FROM employees e JOIN departments d ON e.dept_id = d.dept_id");
    await expect(page.getByRole("columnheader", { name: /salary/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: "Chart" }).click();
    const settings = page.getByRole("complementary", { name: "Chart settings" });
    await expect(settings).toBeVisible();
    // Chart type is a radiogroup of pictograms; the other settings use the styled Select (a labeled
    // trigger opening a menu of menuitemradio rows).
    const pick = async (label: string, option: string) => {
      await settings.getByRole("button", { name: label, exact: true }).click();
      await page.getByRole("menuitemradio", { name: option, exact: true }).click();
    };
    await settings.getByRole("radio", { name: "Bar", exact: true }).click();
    await pick("X axis column", "dept_name");
    await pick("Series 1 column", "salary");
    await pick("Series 1 aggregation", "Average");
    await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
    await expect(page.locator(".recharts-bar-rectangle")).toHaveCount(4);
    await settings.getByRole("radio", { name: "Scorecard", exact: true }).click();
    await expect(page.locator(".recharts-bar-rectangle")).toHaveCount(0);
  });
});

test.describe("Results grid", () => {
  test("selects a range and shows its aggregates", async ({ page }) => {
    await openWithSamples(page);
    await runSql(page, "SELECT name, salary FROM employees ORDER BY emp_id");
    await expect(page.getByRole("columnheader", { name: /salary/ })).toBeVisible({ timeout: 15_000 });
    const cells = page.getByRole("row").nth(1).getByRole("gridcell");
    await cells.nth(1).click();
    await page.getByRole("row").nth(3).getByRole("gridcell").nth(1).click({ modifiers: ["Shift"] });
    await expect(page.getByText("3 cells")).toBeVisible();
    await expect(page.getByText(/Sum\s/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Show column stats" })).toBeVisible();
  });
});

test.describe("Workbench tools", () => {
  test("formats SQL and inspects a result column", async ({ page }) => {
    await openWithSamples(page);
    await runSql(page, "select dept_id, count(*) as n from employees group by dept_id");
    await expect(page.getByRole("columnheader", { name: /dept_id/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Format SQL" }).click();
    await expect(page.locator(".monaco-editor")).toContainText("SELECT");
    await expect(page.locator(".monaco-editor")).toContainText("GROUP BY");

    await page.getByRole("button", { name: "Menu for n" }).click();
    await page.getByRole("menuitem", { name: "Inspect column" }).click();
    await expect(page.getByText("Distinct")).toBeVisible();
    await page.getByRole("button", { name: "Close inspector" }).click();

    await page.getByRole("tab", { name: "Details" }).click();
    await expect(page.getByText(/group by dept_id/)).toBeVisible();
  });
});

test.describe("AI assistant conversation", () => {
  test("remembers earlier turns, sees the run log, and repairs SQL that doesn't compile", async ({ page }) => {
    const bodies: { input: string; history?: { role: string; content: string }[] }[] = [];
    const answers = [
      "SELECT table_name, column_name, key_type FROM querypad.keys",
      // First try at the follow-up references a column that doesn't exist…
      "SELECT e.*, d.* FROM employees e JOIN departments d ON e.department = d.dept_id",
      // …and the repair is correct.
      "```sql\nSELECT e.*, d.dept_name FROM employees e LEFT JOIN departments d ON e.dept_id = d.dept_id\n```",
    ];
    await page.route("**/api/complete", async (route: Route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: { providers: ["openrouter"] } });
        return;
      }
      bodies.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: "text/plain", body: answers[bodies.length - 1] ?? "SELECT 1" });
    });

    await openWithSamples(page);
    await runSql(page, "SELECT COUNT(*) FROM employees");
    await expect(page.getByRole("gridcell", { name: "12" })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /Ask AI/ }).click();
    await page.getByLabel("Describe the query").fill("query to see all tables and their keys");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("ai-turn")).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByTestId("ai-turn").first()).toContainText("compiles");

    // The first request carried the schema, the joins hint and the user's run log.
    expect(bodies[0].input).toContain("### employees (12 rows)");
    expect(bodies[0].input).toContain("querypad.relationships");
    expect(bodies[0].input).toContain("[ok, 1 rows] SELECT COUNT(*) FROM employees");

    await page.getByLabel("Describe the query").fill("now select all values from all tables, properly linked");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("ai-turn")).toHaveCount(2, { timeout: 15_000 });
    const second = page.getByTestId("ai-turn").nth(1);
    await expect(second).toContainText("LEFT JOIN departments");
    await expect(second).toContainText("compiles");

    // The follow-up remembered the first exchange…
    expect(bodies[1].history?.map((h) => h.content)).toEqual([
      "query to see all tables and their keys",
      "SELECT table_name, column_name, key_type FROM querypad.keys",
    ]);
    // …and the repair request quoted DuckDB's error.
    expect(bodies).toHaveLength(3);
    expect(bodies[2].input).toMatch(/failed in DuckDB with this error/);

    await second.getByRole("button", { name: "Use and run" }).click();
    await expect(page.getByRole("columnheader", { name: /dept_name/ })).toBeVisible({ timeout: 10_000 });

    // The conversation is saved with the tab.
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /Ask AI/ }).click();
    await expect(page.getByTestId("ai-turn")).toHaveCount(2);
    await page.getByRole("button", { name: "New conversation" }).click();
    await expect(page.getByTestId("ai-turn")).toHaveCount(0);
  });
});

test.describe("Upgrading saved data", () => {
  /** Write records straight into idb-keyval's default store, as older versions did. */
  async function seed(page: Page, records: Record<string, unknown>, history?: unknown[]) {
    await page.goto("/shared"); // loads the origin without opening any space
    await page.evaluate(
      async ({ records, history }) => {
        const csv = new Uint8Array(await (await fetch("/sample/departments.csv")).arrayBuffer());
        const db: IDBDatabase = await new Promise((resolve, reject) => {
          const req = indexedDB.open("keyval-store");
          req.onupgradeneeded = () => req.result.createObjectStore("keyval");
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const tx = db.transaction("keyval", "readwrite");
        for (const [key, value] of Object.entries(records)) {
          // "$CSV" placeholders become the real file bytes.
          const json = JSON.stringify(value);
          const restored = JSON.parse(json, (_k, v) => (v === "$CSV" ? csv : v));
          tx.objectStore("keyval").put(restored, key);
        }
        await new Promise((resolve) => (tx.oncomplete = resolve));
        if (history) localStorage.setItem("querypad:history", JSON.stringify(history));
      },
      { records, history }
    );
  }

  test("a v0.7 workspace becomes the space 'My workspace' with its tables, tabs and history", async ({ page }) => {
    await seed(
      page,
      {
        "querypad-workspace": {
          files: [{ name: "depts", fileName: "departments.csv" }],
          tabs: [{ id: "t1", title: "Saved tab", query: "SELECT * FROM depts", createdAt: 1 }],
          activeTabId: "t1",
          viewMode: "sql",
        },
        "querypad-file:depts": { name: "depts", fileName: "departments.csv", data: "$CSV" },
      },
      [{ id: "h1", sql: "SELECT 'from v0.7'", at: 1, rowCount: 1, ms: 1, error: null }]
    );
    await page.goto("/");
    await expect(page.getByRole("button", { name: /^Space: My workspace/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "depts", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Saved tab/ })).toBeVisible();
    await page.getByRole("button", { name: "History", exact: true }).click();
    await expect(page.getByText("SELECT 'from v0.7'")).toBeVisible();
    // Old records are gone; reloading keeps everything.
    await page.reload();
    await expect(page.getByRole("button", { name: "depts", exact: true })).toBeVisible({ timeout: 30_000 });
  });

  test("a v0.6 workspace (file bytes inline) is migrated too", async ({ page }) => {
    await seed(page, {
      "querypad-workspace": {
        fileEntries: [{ name: "old_depts", fileName: "departments.csv", data: "$CSV" }],
        query: "SELECT 42",
      },
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "old_depts", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".monaco-editor")).toContainText("SELECT 42");
  });
});
