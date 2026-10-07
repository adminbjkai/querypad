import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyStep, createdObject, dangerReason, describeDiff, diffCatalog, parsePlan, parseSummary, toPlanSteps } from "../src/lib/agent/plan";
import { AGENT_SYSTEM_PROMPT, agentTurnInput, retryInput, summaryInput } from "../src/lib/ai/agent-prompt";

const FENCED = `I'll create the table and fill it.

\`\`\`json
{"summary": "Create customers with two rows", "steps": [
  {"title": "Create customers (id is the primary key)", "sql": "CREATE TABLE customers (id INTEGER PRIMARY KEY, name VARCHAR);"},
  {"title": "Insert two customers", "sql": "INSERT INTO customers VALUES (1,'Ada'),(2,'Linus')"},
  {"sql": "SELECT COUNT(*) AS n FROM customers"}
]}
\`\`\``;

test("parsePlan reads a fenced plan, keeps the prose, trims semicolons and titles untitled steps", () => {
  const { prose, plan } = parsePlan(FENCED);
  assert.equal(prose, "I'll create the table and fill it.");
  assert.ok(plan);
  assert.equal(plan.summary, "Create customers with two rows");
  assert.equal(plan.steps.length, 3);
  assert.equal(plan.steps[0].sql, "CREATE TABLE customers (id INTEGER PRIMARY KEY, name VARCHAR)");
  assert.equal(plan.steps[2].title, "SELECT COUNT(*) AS n FROM customers");
});

test("parsePlan accepts an unfenced object and a plain ``` fence", () => {
  const bare = parsePlan('Sure. {"summary": "one", "steps": [{"title": "t", "sql": "SELECT 1"}]} done');
  assert.equal(bare.plan?.steps[0].sql, "SELECT 1");
  assert.equal(bare.prose, "Sure.  done");
  const plain = parsePlan('```\n{"steps": [{"sql": "SELECT 2"}]}\n```');
  assert.equal(plain.plan?.steps[0].sql, "SELECT 2");
  assert.equal(plain.plan?.summary, "1 step");
});

test("parsePlan treats invalid or empty plans as prose", () => {
  assert.equal(parsePlan("Just an answer with no plan.").plan, null);
  assert.equal(parsePlan('```json\n{"summary": "x", "steps": "nope"}\n```').plan, null);
  assert.equal(parsePlan('```json\n{"steps": [{"title": "no sql"}]}\n```').plan, null);
  assert.equal(parsePlan("```json\n{not json\n```").plan, null);
  assert.equal(parsePlan("```json\n{not json\n```").prose, "```json\n{not json\n```");
});

test("steps are classified: reads, writes and danger", () => {
  assert.equal(classifyStep("SELECT * FROM t"), "read");
  assert.equal(classifyStep("WITH x AS (SELECT 1) SELECT * FROM x"), "read");
  assert.equal(classifyStep("CREATE TABLE t (id INTEGER)"), "write");
  assert.equal(classifyStep("INSERT INTO t VALUES (1)"), "write");
  // Several statements in one step never inherit the first keyword's classification.
  assert.equal(classifyStep("SELECT 1; DROP TABLE orders"), "danger");
  assert.equal(dangerReason("CREATE TABLE t AS SELECT 1; DELETE FROM orders"), "contains several statements");
  assert.equal(classifyStep("SELECT 1;"), "read");
  assert.equal(classifyStep("SELECT 'a;b' AS s"), "read");
  // CTE-wrapped bulk writes are judged by the write, not by a WHERE inside the CTE.
  assert.equal(classifyStep("WITH x AS (SELECT 1 WHERE true) DELETE FROM t"), "danger");
  assert.equal(classifyStep("WITH x AS (SELECT 1) UPDATE t SET a = 1 WHERE a = 2"), "write");
  assert.equal(classifyStep("UPDATE t SET a = 1 WHERE id = 2"), "write");
  assert.equal(classifyStep("DELETE FROM t WHERE id = 2"), "write");
  assert.equal(classifyStep("DROP TABLE customers"), "danger");
  assert.equal(classifyStep("-- clean\nTRUNCATE t"), "danger");
  assert.equal(classifyStep("DELETE FROM t"), "danger");
  assert.equal(classifyStep("UPDATE t SET a = 'where'"), "danger");
  assert.equal(classifyStep("ALTER TABLE t DROP COLUMN a"), "danger");
  assert.equal(classifyStep("ALTER TABLE t ADD COLUMN b INTEGER"), "write");
  assert.equal(classifyStep("CREATE OR REPLACE TABLE t AS SELECT 1"), "danger");
  assert.equal(dangerReason("DROP VIEW v"), "drops an object");
  assert.equal(dangerReason("SELECT 1"), null);
});

test("toPlanSteps gives ids and pending status; createdObject tracks what the session made", () => {
  let n = 0;
  const steps = toPlanSteps(parsePlan(FENCED).plan!, () => `s${++n}`);
  assert.deepEqual(
    steps.map((s) => [s.id, s.kind, s.status]),
    [
      ["s1", "write", "pending"],
      ["s2", "write", "pending"],
      ["s3", "read", "pending"],
    ]
  );
  assert.equal(createdObject(steps[0].sql), "customers");
  assert.equal(createdObject('CREATE OR REPLACE VIEW main."Order Lines" AS SELECT 1'), "order lines");
  assert.equal(createdObject("INSERT INTO t VALUES (1)"), null);
});

test("diffCatalog reports added, removed and resized tables and views", () => {
  const diff = diffCatalog(
    { tables: [{ name: "a", rowCount: 2 }, { name: "gone", rowCount: 1 }], views: ["v1"] },
    { tables: [{ name: "a", rowCount: 5 }, { name: "new", rowCount: 0 }], views: ["v2"] }
  );
  assert.deepEqual(diff.tablesAdded, ["new"]);
  assert.deepEqual(diff.tablesRemoved, ["gone"]);
  assert.deepEqual(diff.rowDeltas, [{ name: "a", before: 2, after: 5 }]);
  assert.deepEqual(diff.viewsAdded, ["v2"]);
  assert.deepEqual(diff.viewsRemoved, ["v1"]);
  assert.deepEqual(describeDiff(diff), ["created table new", "dropped table gone", "a: 2 → 5 rows", "created view v2", "dropped view v1"]);
});

test("parseSummary separates the closing note from up to three suggestions", () => {
  const reply = 'Created **customers** (2 rows).\n```json\n{"suggestions": ["Add orders", "Add a date dimension", "Profile customers", "four"]}\n```';
  const parsed = parseSummary(reply);
  assert.equal(parsed.text, "Created **customers** (2 rows).");
  assert.deepEqual(parsed.suggestions, ["Add orders", "Add a date dimension", "Profile customers"]);
  assert.deepEqual(parseSummary("Nothing changed."), { text: "Nothing changed.", suggestions: [] });
});

test("prompts carry the protocol, the session's objects, the failure and the diff", () => {
  assert.match(AGENT_SYSTEM_PROMPT, /```json/);
  assert.match(AGENT_SYSTEM_PROMPT, /never DROP, TRUNCATE or replace anything you did not create in this session/);
  const turn = agentTurnInput("## Tables\n(none loaded)", "Make a schema", ["customers"]);
  assert.match(turn, /Objects you created in this session[^\n]*customers/);
  assert.match(turn, /Request: Make a schema$/);
  const steps = toPlanSteps(parsePlan(FENCED).plan!, () => crypto.randomUUID());
  steps[0].status = "ok";
  steps[1].status = "error";
  steps[1].error = "Constraint Error: duplicate key";
  const retry = retryInput("ctx", steps, steps[1], ["customers"]);
  assert.match(retry, /already ran successfully[\s\S]*Create customers/);
  assert.match(retry, /This step failed:\nINSERT INTO customers[\s\S]*duplicate key/);
  assert.match(retry, /had not run yet:\n- SELECT COUNT/);
  steps[2].status = "ok";
  steps[2].result = { columns: ["n"], columnTypes: ["BIGINT"], rows: [{ n: 2 }], rowCount: 1, ms: 3 };
  const summary = summaryInput("Make a schema", steps, diffCatalog({ tables: [], views: [] }, { tables: [{ name: "customers", rowCount: 2 }], views: [] }));
  assert.match(summary, /\[ok, 1 rows\] SELECT COUNT/);
  assert.match(summary, /\[failed: Constraint Error/);
  assert.match(summary, /- created table customers/);
});
