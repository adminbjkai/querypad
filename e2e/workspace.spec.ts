import { test, expect, type Page, type Route } from "@playwright/test";

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

    await page.getByRole("tab", { name: /Joins/ }).click();
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
    await page.getByRole("tab", { name: /Joins/ }).click();
    await expect(page.getByText(/inferred from your data/)).toBeVisible({ timeout: 20_000 });
    await runSql(page, "SELECT table_name, column_name, key_type, references_table FROM querypad.keys ORDER BY table_name");
    await expect(page.getByRole("gridcell", { name: "primary key" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("gridcell", { name: "foreign key" })).toBeVisible();
    // Internal tables never show up as user tables.
    await page.getByRole("tab", { name: "Tables" }).click();
    await expect(page.getByText("2 tables")).toBeVisible();
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
    await expect(page.getByRole("button", { name: /^Space: Fresh/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "notes", exact: true })).toHaveCount(0);

    // An empty space shows the start screen.
    await page.getByRole("button", { name: /^Space: / }).click();
    await page.getByRole("button", { name: /New empty space/ }).click();
    await page.getByLabel("New space name").fill("Blank");
    await page.getByRole("button", { name: "Create" }).click();
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

    await page.getByRole("button", { name: /^Space: / }).click();
    await page.getByRole("button", { name: /^Analysis/ }).click();
    await expect(page.getByRole("button", { name: /^Space: Analysis/ })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.getByRole("button", { name: /^Space: Analysis/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "notes", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible();
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
    await page.getByRole("tab", { name: "History" }).click();
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
