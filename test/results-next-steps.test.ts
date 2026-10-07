import assert from "node:assert/strict";
import test from "node:test";
import { computeNextSteps } from "../src/lib/results/next-steps";
import type { TableInfo } from "../src/types";
import type { Relationship } from "../src/types/discovery";

const tables: TableInfo[] = [
  { name: "employees", rowCount: 10, columns: [{ name: "emp_id", type: "INTEGER" }, { name: "dept_id", type: "INTEGER" }, { name: "name", type: "VARCHAR" }] },
  { name: "departments", rowCount: 4, columns: [{ name: "dept_id", type: "INTEGER" }, { name: "dept_name", type: "VARCHAR" }] },
];

const rel: Relationship = {
  from: { table: "employees", column: "dept_id" },
  to: { table: "departments", column: "dept_id" },
  confidence: 95,
  cardinality: "many-to-one",
  signals: { valueOverlap: 0.98, nameSimilarity: 1, typeMatch: 1, cardinalityShape: 1 },
};

const base = { tables, relationships: [rel], verdicts: {} };

test("suggests a verified join to a related table the query does not use, a group-and-count, and the profile", () => {
  const steps = computeNextSteps({ ...base, sql: "SELECT emp_id, name FROM employees LIMIT 10;", columns: ["emp_id", "name"], columnTypes: ["INTEGER", "VARCHAR"] });
  assert.deepEqual(steps.map((s) => s.kind), ["join", "group", "profile"]);
  assert.equal(steps[0].label, "Join employees ↔ departments on dept_id (98% overlap)");
  assert.equal(
    steps[0].kind === "join" && steps[0].sql,
    'SELECT "employees".*, "departments"."dept_name"\nFROM "employees"\nJOIN "departments" ON "employees"."dept_id" = "departments"."dept_id"\nLIMIT 100'
  );
  assert.equal(steps[1].label, "Group name and count");
  assert.equal(steps[1].kind === "group" && steps[1].sql, 'SELECT "name", COUNT(*) AS n\nFROM (\nSELECT emp_id, name FROM employees LIMIT 10\n) AS q\nGROUP BY 1\nORDER BY 2 DESC');
  assert.deepEqual(steps[2], { kind: "profile", label: "Profile employees", table: "employees" });
});

test("skips the join when both tables are already in the query or the relationship is rejected", () => {
  const joined = "SELECT d.dept_name, COUNT(*) AS n FROM employees e JOIN departments d ON e.dept_id = d.dept_id GROUP BY 1";
  assert.deepEqual(computeNextSteps({ ...base, sql: joined, columns: ["dept_name", "n"], columnTypes: ["VARCHAR", "BIGINT"] }).map((s) => s.kind), ["group", "profile"]);
  const rejected = computeNextSteps({
    ...base,
    verdicts: { "employees.dept_id->departments.dept_id": "rejected" },
    sql: "SELECT * FROM departments",
    columns: ["dept_id", "dept_name"],
    columnTypes: ["INTEGER", "VARCHAR"],
  });
  assert.deepEqual(rejected.map((s) => s.kind), ["group", "profile"]);
});

test("works from the key side too, and offers nothing for queries over no loaded table", () => {
  const steps = computeNextSteps({ ...base, sql: "SELECT * FROM departments", columns: ["dept_id", "dept_name"], columnTypes: ["INTEGER", "VARCHAR"] });
  assert.equal(steps[0].label, "Join departments ↔ employees on dept_id (98% overlap)");
  assert.deepEqual(computeNextSteps({ ...base, sql: "SELECT 1 AS x", columns: ["x"], columnTypes: ["INTEGER"] }), []);
  // Several statements can't be wrapped as a subquery; no text column means no group step.
  assert.deepEqual(
    computeNextSteps({ ...base, sql: "SELECT 1; SELECT name FROM employees", columns: ["name"], columnTypes: ["VARCHAR"] }).map((s) => s.kind),
    ["join", "profile"]
  );
});
