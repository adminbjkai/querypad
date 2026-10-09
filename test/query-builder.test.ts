import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuerySql, inferJoin, type BuilderJoin, type BuilderTable } from "../src/lib/query-builder/sql";

const employees: BuilderTable = {
  name: "employees",
  columns: [
    { name: "name", included: true },
    { name: "dept_id", included: false },
  ],
};
const departments: BuilderTable = {
  name: "departments",
  columns: [
    { name: "dept_name", included: true },
    { name: "dept_id", included: false },
  ],
};

test("one table with no checked columns is SELECT *", () => {
  const built = buildQuerySql([{ name: "employees", columns: [{ name: "name", included: false }] }], []);
  assert.equal(built.sql, `SELECT *\nFROM "employees"`);
  assert.deepEqual(built.unjoined, []);
});

test("checked columns and a left join resolve into SQL", () => {
  const join: BuilderJoin = {
    table: "departments",
    onTable: "employees",
    tableColumn: "dept_id",
    onColumn: "dept_id",
    kind: "LEFT",
  };
  const built = buildQuerySql([employees, departments], [join]);
  assert.equal(
    built.sql,
    `SELECT "employees"."name",\n  "departments"."dept_name"\nFROM "employees"\nLEFT JOIN "departments" ON "employees"."dept_id" = "departments"."dept_id"`
  );
  assert.deepEqual(built.unjoined, []);
});

test("a where clause is appended and an inferred relationship beats the first columns", () => {
  const built = buildQuerySql([employees, departments], [
    { table: "departments", onTable: "employees", tableColumn: "dept_id", onColumn: "dept_id", kind: "INNER" },
  ], "employees.dept_id = 10");
  assert.match(built.sql, /WHERE employees\.dept_id = 10$/);

  const inferred = inferJoin(
    "departments",
    [{ name: "employees", columns: [{ name: "emp_id" }, { name: "dept_id" }] }],
    [{ from: { table: "employees", column: "dept_id" }, to: { table: "departments", column: "dept_id" } }],
    [{ name: "dept_id" }, { name: "dept_name" }]
  );
  assert.equal(inferred?.onColumn, "dept_id");
  assert.equal(inferred?.tableColumn, "dept_id");
  assert.equal(inferred?.automatic, undefined);

  const fallback = inferJoin("departments", [{ name: "employees", columns: [{ name: "emp_id" }] }], [], [{ name: "dept_id" }]);
  assert.equal(fallback?.automatic, true);
  assert.equal(fallback?.onColumn, "emp_id");
});

test("a table with no join is left out and reported", () => {
  const built = buildQuerySql([employees, departments], []);
  assert.match(built.sql, /FROM "employees"/);
  assert.doesNotMatch(built.sql, /departments/);
  assert.deepEqual(built.unjoined, ["departments"]);
});
