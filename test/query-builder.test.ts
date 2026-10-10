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

test("a where clause is appended and a discovered relationship is used for the join", () => {
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
});

test("without a relationship, a shared key-like column joins (an *_id name first); otherwise nothing does", () => {
  const byName = inferJoin(
    "departments",
    [
      { name: "employees", columns: [{ name: "emp_id" }, { name: "name" }] },
      { name: "assignments", columns: [{ name: "name" }, { name: "Dept_ID" }] },
    ],
    [],
    [{ name: "name" }, { name: "dept_id" }]
  );
  assert.deepEqual(byName, {
    table: "departments",
    onTable: "assignments",
    tableColumn: "dept_id",
    onColumn: "Dept_ID",
    kind: "INNER",
    automatic: true,
  });

  // A shared column that isn't key-like (`name`) is never a join, and neither is a shared plain
  // `id`: two tables' surrogate keys almost never mean the same thing.
  const notKey = inferJoin("departments", [{ name: "employees", columns: [{ name: "emp_id" }, { name: "name" }] }], [], [{ name: "dept_id" }, { name: "name" }]);
  assert.equal(notKey, null);
  const plainId = inferJoin("b", [{ name: "a", columns: [{ name: "id" }, { name: "label" }] }], [], [{ name: "ID" }, { name: "label" }]);
  assert.equal(plainId, null);

  // No relationship and no shared name: never a first-column-to-first-column guess.
  const none = inferJoin("departments", [{ name: "employees", columns: [{ name: "emp_id" }] }], [], [{ name: "dept_id" }]);
  assert.equal(none, null);
  const built = buildQuerySql([employees, { name: "departments", columns: [{ name: "dept_id", included: false }] }], none ? [none] : []);
  assert.deepEqual(built.unjoined, ["departments"]);
});

test("a column name checked in two tables gets distinct aliases", () => {
  const join: BuilderJoin = { table: "departments", onTable: "employees", tableColumn: "dept_id", onColumn: "dept_id", kind: "INNER" };
  const built = buildQuerySql(
    [
      { name: "employees", columns: [{ name: "name", included: true }, { name: "dept_id", included: true }] },
      { name: "departments", columns: [{ name: "DEPT_ID", included: true }, { name: "dept_name", included: true }] },
    ],
    [join]
  );
  assert.equal(
    built.sql.split("\nFROM")[0],
    `SELECT "employees"."name",\n  "employees"."dept_id" AS "employees_dept_id",\n  "departments"."DEPT_ID" AS "departments_DEPT_ID",\n  "departments"."dept_name"`
  );

  // A generated alias never reuses a name that is already an output column.
  const clash = buildQuerySql(
    [
      { name: "a", columns: [{ name: "id", included: true }, { name: "b_id", included: true }] },
      { name: "b", columns: [{ name: "id", included: true }] },
    ],
    [{ table: "b", onTable: "a", tableColumn: "id", onColumn: "b_id", kind: "INNER" }]
  );
  assert.match(clash.sql, /"a"\."id" AS "a_id",\n {2}"a"\."b_id",\n {2}"b"\."id" AS "b_id_2"/);
});

test("a table with no join is left out and reported", () => {
  const built = buildQuerySql([employees, departments], []);
  assert.match(built.sql, /FROM "employees"/);
  assert.doesNotMatch(built.sql, /departments/);
  assert.deepEqual(built.unjoined, ["departments"]);
});
