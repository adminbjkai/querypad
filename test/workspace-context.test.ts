import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkspaceContext, cleanSql, columnHint, threadToHistory } from "../src/lib/ai/workspace-context";
import { relationshipKey } from "../src/lib/discovery/relationships";
import type { ColumnProfile } from "../src/types";
import type { Relationship } from "../src/types/discovery";

const deptCol: ColumnProfile = {
  name: "dept_id", type: "VARCHAR", kind: "text", nullCount: 0, nullPercent: 0, distinctCount: 4,
  min: null, max: null, avg: null,
  topValues: [{ value: "D1", count: 4 }, { value: "D2", count: 3 }, { value: "D3", count: 3 }, { value: "D4", count: 2 }],
};

test("column hints list real values for low-cardinality columns", () => {
  assert.equal(columnHint(deptCol, 12), "values: D1, D2, D3, D4");
  const salary: ColumnProfile = { ...deptCol, name: "salary", type: "BIGINT", kind: "numeric", distinctCount: 12, min: 68000, max: 112000, topValues: [] };
  assert.equal(columnHint(salary, 12), "unique; 68000 to 112000");
});

const rel = (from: string, to: string): Relationship => {
  const [ft, fc] = from.split(".");
  const [tt, tc] = to.split(".");
  return {
    from: { table: ft, column: fc }, to: { table: tt, column: tc }, confidence: 100, cardinality: "many-to-one",
    signals: { valueOverlap: 1, nameSimilarity: 1, typeMatch: 1, cardinalityShape: 1 },
  };
};

test("workspace context carries tables, views, joins by status, run log and editor state", () => {
  const accepted = rel("employees.dept_id", "departments.dept_id");
  const inferred = rel("employee_bio.emp_id", "employees.emp_id");
  const rejected = rel("departments.manager_id", "employees.emp_id");
  const context = buildWorkspaceContext({
    tables: [
      { name: "employees", rowCount: 12, columns: [{ name: "emp_id", type: "BIGINT" }, { name: "dept_id", type: "VARCHAR" }] },
      { name: "employee_bio", rowCount: 3, columns: [{ name: "emp_id", type: "BIGINT" }] },
    ],
    views: [{ name: "v_staff", rowCount: 0, sql: "CREATE VIEW v_staff AS ...", columns: [{ name: "name", type: "VARCHAR" }] }],
    profiles: { employees: { tableName: "employees", rowCount: 12, columnCount: 2, generatedAt: 0, columns: [deptCol] } },
    relationships: [inferred, accepted, rejected],
    verdicts: { [relationshipKey(accepted)]: "accepted", [relationshipKey(rejected)]: "rejected" },
    relationshipKey,
    log: [
      { sql: "CREATE TABLE employee_bio AS SELECT 1", rowCount: 0, error: null },
      { sql: "SELECT nope FROM employees", rowCount: null, error: "Binder Error: nope" },
    ],
    editorQuery: "SELECT * FROM employees",
    editorError: null,
  });
  assert.match(context, /### employee_bio \(3 rows\)/);
  assert.match(context, /- dept_id VARCHAR — values: D1, D2, D3, D4/);
  assert.match(context, /## Views\n### v_staff/);
  // Accepted joins come first, rejected ones are listed only as "never join".
  const joins = context.slice(context.indexOf("## Joins"));
  assert.ok(joins.indexOf("employees.dept_id -> departments.dept_id") < joins.indexOf("employee_bio.emp_id -> employees.emp_id"));
  assert.match(joins, /accepted by the user/);
  assert.match(joins, /Rejected by the user \(never join on these\): departments\.manager_id -> employees\.emp_id/);
  assert.match(context, /1\. \[ok, 0 rows\] CREATE TABLE employee_bio/);
  assert.match(context, /2\. \[failed: Binder Error: nope\]/);
  assert.match(context, /## SQL currently in the editor\nSELECT \* FROM employees/);
});

test("thread history alternates user requests and the SQL that was produced", () => {
  const history = threadToHistory([
    { id: "1", prompt: "list tables and keys", sql: "SELECT * FROM querypad.keys", at: 0, check: "ok" },
    { id: "2", prompt: "now join everything", sql: "SELECT bad", at: 1, check: "failed", checkError: "Binder Error" },
  ]);
  assert.deepEqual(history.map((h) => h.role), ["user", "assistant", "user", "assistant"]);
  assert.equal(history[1].content, "SELECT * FROM querypad.keys");
  assert.match(history[3].content, /did not compile: Binder Error/);
});

test("cleanSql strips fences and surrounding prose", () => {
  assert.equal(cleanSql("```sql\nSELECT 1\n```"), "SELECT 1");
  assert.equal(cleanSql("Here you go:\n```\nSELECT 2\n```\nEnjoy"), "SELECT 2");
  assert.equal(cleanSql("  SELECT 3  "), "SELECT 3");
});

test("empty tables and name-only joins are labelled; long sample values are clipped", () => {
  const nameOnly: Relationship = { ...rel("employee_bio.emp_id", "employees.emp_id"), confidence: 60, evidence: "name" };
  const context = buildWorkspaceContext({
    tables: [
      { name: "employees", columns: [{ name: "emp_id", type: "BIGINT" }], rowCount: 12 },
      { name: "employee_bio", columns: [{ name: "emp_id", type: "BIGINT" }, { name: "birth_date", type: "DATE" }], rowCount: 0 },
    ],
    views: [],
    profiles: {},
    relationships: [nameOnly],
    verdicts: {},
    relationshipKey,
    log: [],
    editorQuery: "",
    editorError: null,
  });
  assert.match(context, /### employee_bio \(empty, 0 rows\)/);
  assert.match(context, /- birth_date DATE/);
  assert.match(context, /employee_bio\.emp_id -> employees\.emp_id .*column name only/);

  const long = { ...deptCol, distinctCount: 2, topValues: [{ value: "x".repeat(500), count: 1 }] };
  assert.ok(columnHint(long, 12).length < 80);
});
