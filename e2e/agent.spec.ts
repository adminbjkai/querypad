import { test, expect, type Page, type Route } from "./fixtures";

/**
 * The Agent page: a planning, write-capable AI with approvals. The model is mocked at
 * /api/complete; DuckDB runs for real, so the tables the plan creates are real too.
 */

const PLAN = `I'll create a customers table with two rows and count them.

\`\`\`json
{"summary": "Create customers and load two rows", "steps": [
  {"title": "Create customers (id is the primary key)", "sql": "CREATE TABLE customers (id INTEGER PRIMARY KEY, name VARCHAR)"},
  {"title": "Insert two customers", "sql": "INSERT INTO customers VALUES (1,'Ada'),(2,'Linus')"},
  {"title": "Count the rows", "sql": "SELECT COUNT(*) AS n FROM customers"}
]}
\`\`\``;

const SUMMARY = `Created **customers** with 2 rows; \`id\` is the primary key so each customer is unique.

\`\`\`json
{"suggestions": ["Add an orders table", "Profile customers", "Add a date dimension"]}
\`\`\``;

const DROP_PLAN = `I'll remove the departments table.

\`\`\`json
{"summary": "Drop departments", "steps": [{"title": "Drop departments", "sql": "DROP TABLE departments"}]}
\`\`\``;

type Body = { provider: string; system: string; input: string };

async function mockModel(page: Page, replies: string[]): Promise<Body[]> {
  const bodies: Body[] = [];
  await page.route("**/api/complete", async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { providers: ["local-claude"] } });
      return;
    }
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "text/plain", body: replies[bodies.length - 1] ?? "Done." });
  });
  return bodies;
}

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const composer = (page: Page) => page.getByLabel("Ask the agent");
const plan = (page: Page) => page.getByRole("region", { name: "Plan" });

async function openAgent(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 30_000 });
  await nav(page).getByRole("button", { name: "Agent", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Agent", level: 1 })).toBeVisible();
  await expect(composer(page)).toBeVisible();
}

test.describe("Agent", () => {
  test.describe.configure({ timeout: 90_000 });

  test("plans, waits for each write, runs the read, summarizes and keeps the session", async ({ page }) => {
    const bodies = await mockModel(page, [PLAN, SUMMARY]);
    await openAgent(page);
    await expect(page.getByText("Hi — what should we build?")).toBeVisible();

    await composer(page).fill("Create a customers table with two rows");
    await composer(page).press("Enter");

    // The plan card lists the three steps with their kinds; nothing has run yet.
    const steps = plan(page).getByTestId("agent-step");
    await expect(steps).toHaveCount(3, { timeout: 15_000 });
    await expect(steps.nth(0)).toContainText("Write");
    await expect(steps.nth(1)).toContainText("Write");
    await expect(steps.nth(2)).toContainText("Read");
    expect(bodies).toHaveLength(1);
    expect(bodies[0].provider).toBe("local-claude");
    expect(bodies[0].system).toContain("QueryPad Agent");
    expect(bodies[0].input).toContain("## Tables");
    expect(bodies[0].input).toContain("Request: Create a customers table with two rows");
    await expect(nav(page).getByRole("button", { name: "Tables", exact: true })).toContainText("2");

    // Run: the first write waits for approval, then the second; "Run all remaining" lets the rest go.
    await plan(page).getByRole("button", { name: "Run plan" }).click();
    await expect(steps.nth(0).getByRole("group", { name: "Approve step 1" })).toBeVisible();
    await expect(steps.nth(0)).toContainText("CREATE TABLE customers");
    await steps.nth(0).getByRole("button", { name: "Run", exact: true }).click();
    await expect(steps.nth(0)).toHaveAttribute("data-status", "ok", { timeout: 15_000 });
    await expect(steps.nth(1).getByRole("group", { name: "Approve step 2" })).toBeVisible();
    await steps.nth(1).getByRole("button", { name: "Run all remaining" }).click();
    await expect(steps.nth(1)).toHaveAttribute("data-status", "ok", { timeout: 15_000 });
    await expect(steps.nth(1)).toContainText("2 affected");

    // The read step ran on its own and shows its result grid.
    await expect(steps.nth(2)).toHaveAttribute("data-status", "ok", { timeout: 15_000 });
    await expect(steps.nth(2)).toContainText("1 row");
    await steps.nth(2).getByRole("button", { name: /^Step 3/ }).click();
    await expect(steps.nth(2).getByRole("gridcell", { name: "2", exact: true })).toBeVisible();

    // The summary links the new table and offers follow-ups; the catalog has the table.
    const summary = page.getByRole("region", { name: "Summary" });
    await expect(summary).toBeVisible({ timeout: 15_000 });
    await expect(summary.getByRole("button", { name: "Open table customers" })).toBeVisible();
    await expect(summary).toContainText("id");
    expect(bodies).toHaveLength(2);
    expect(bodies[1].input).toContain("created table customers");
    expect(bodies[1].input).toMatch(/\[ok, 2 rows affected\] Insert two customers/);
    await summary.getByRole("button", { name: /Add an orders table/ }).click();
    await expect(composer(page)).toHaveValue("Add an orders table");
    await expect(nav(page).getByRole("button", { name: "Tables", exact: true })).toContainText("3");

    // The session survives a reload and is listed by its title.
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.getByRole("button", { name: "employees", exact: true })).toBeVisible({ timeout: 30_000 });
    await nav(page).getByRole("button", { name: "Agent", exact: true }).click();
    const chats = page.getByRole("list", { name: "All chats" });
    await expect(chats.getByRole("button", { name: /^Create a customers table with two rows/ })).toBeVisible();
    await expect(plan(page).getByTestId("agent-step")).toHaveCount(3);
    await expect(page.getByRole("region", { name: "Summary" })).toBeVisible();
  });

  test("Auto-apply runs every step without stopping", async ({ page }) => {
    await mockModel(page, [PLAN, SUMMARY]);
    await openAgent(page);
    await page.getByRole("radiogroup", { name: "Approvals" }).getByRole("radio", { name: "Auto" }).click();
    await composer(page).fill("Create a customers table with two rows");
    await composer(page).press("Enter");
    const steps = plan(page).getByTestId("agent-step");
    await expect(steps).toHaveCount(3, { timeout: 15_000 });
    await plan(page).getByRole("button", { name: "Run plan" }).click();
    await expect(page.getByRole("region", { name: "Summary" })).toBeVisible({ timeout: 20_000 });
    for (let i = 0; i < 3; i++) await expect(steps.nth(i)).toHaveAttribute("data-status", "ok");
    await expect(page.getByRole("group", { name: /Approve step/ })).toHaveCount(0);
    await expect(nav(page).getByRole("button", { name: "Tables", exact: true })).toContainText("3");
  });

  test("a destructive step is marked Danger and needs a confirmation; Cancel keeps the table", async ({ page }) => {
    await mockModel(page, [DROP_PLAN, SUMMARY]);
    await openAgent(page);
    await composer(page).fill("Drop the departments table");
    await composer(page).press("Enter");
    const step = plan(page).getByTestId("agent-step").first();
    await expect(step).toBeVisible({ timeout: 15_000 });
    await expect(step).toContainText("Danger");

    await plan(page).getByRole("button", { name: "Run plan" }).click();
    await step.getByRole("button", { name: "Run", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Run a destructive step?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("DROP TABLE departments");
    await expect(dialog.getByRole("button", { name: "Run step" })).toHaveClass(/bg-danger/);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);

    // Still waiting, nothing ran, the table is still there.
    await expect(step).toHaveAttribute("data-status", "pending");
    await expect(page.getByRole("region", { name: "Summary" })).toHaveCount(0);
    await expect(nav(page).getByRole("button", { name: "Tables", exact: true })).toContainText("2");
    await nav(page).getByRole("button", { name: "SQL", exact: true }).click();
    await expect(page.getByRole("button", { name: "departments", exact: true })).toBeVisible();
  });
});
