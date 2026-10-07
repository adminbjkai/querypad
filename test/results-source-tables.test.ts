import assert from "node:assert/strict";
import test from "node:test";
import { columnSignals, mainSourceTable, mapResultColumn, parseSourceTables } from "../src/lib/results/source-tables";
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
  signals: { valueOverlap: 1, nameSimilarity: 1, typeMatch: 1, cardinalityShape: 1 },
};

test("parseSourceTables lists FROM and JOIN tables in order with aliases", () => {
  const sql = `SELECT d.dept_name, COUNT(*) AS headcount
FROM employees e
JOIN departments d ON e.dept_id = d.dept_id
GROUP BY d.dept_name`;
  assert.deepEqual(parseSourceTables(sql), [
    { table: "employees", alias: "e" },
    { table: "departments", alias: "d" },
  ]);
});

test("parseSourceTables ignores keywords after the table, schema prefixes, quoted names, functions and subqueries", () => {
  assert.deepEqual(parseSourceTables('select * from main."Order Lines" where 1=1'), [{ table: "Order Lines", alias: null }]);
  assert.deepEqual(parseSourceTables("SELECT * FROM employees WHERE salary > 1 ORDER BY 1"), [{ table: "employees", alias: null }]);
  assert.deepEqual(parseSourceTables("SELECT * FROM read_csv('x.csv') LIMIT 5"), []);
  assert.deepEqual(parseSourceTables("SELECT * FROM (SELECT 1) AS q"), []);
  assert.deepEqual(parseSourceTables("SELECT * FROM employees AS e LEFT JOIN employees m ON e.emp_id = m.emp_id"), [{ table: "employees", alias: "e" }]);
  assert.deepEqual(parseSourceTables("SELECT 'from fake' AS s FROM employees -- from comment"), [{ table: "employees", alias: null }]);
});

test("mainSourceTable is the first FROM table that is loaded", () => {
  assert.equal(mainSourceTable("SELECT * FROM missing JOIN departments USING (dept_id)", tables), "departments");
  assert.equal(mainSourceTable("SELECT 1", tables), null);
});

test("mapResultColumn traces a result column to the first source table owning it", () => {
  const sql = "SELECT e.dept_id, d.dept_name, COUNT(*) AS n FROM employees e JOIN departments d ON e.dept_id = d.dept_id GROUP BY 1, 2";
  assert.deepEqual(mapResultColumn("dept_name", sql, tables), { table: "departments", column: "dept_name" });
  assert.deepEqual(mapResultColumn("dept_id", sql, tables), { table: "employees", column: "dept_id" });
  assert.equal(mapResultColumn("n", sql, tables), null);
});

test("columnSignals reports keys, referencing tables and overlap, skipping rejected joins", () => {
  const key = columnSignals({ table: "departments", column: "dept_id" }, [rel], {});
  assert.deepEqual(key, { unique: true, referencedBy: ["employees"], references: [] });
  const foreign = columnSignals({ table: "employees", column: "dept_id" }, [rel], {});
  assert.deepEqual(foreign, { unique: null, referencedBy: [], references: [{ table: "departments", column: "dept_id", overlap: 1 }] });
  const rejected = columnSignals({ table: "departments", column: "dept_id" }, [rel], { "employees.dept_id->departments.dept_id": "rejected" });
  assert.deepEqual(rejected, { unique: null, referencedBy: [], references: [] });
  const profiled = columnSignals({ table: "employees", column: "name" }, [rel], {}, {
    tableName: "employees",
    rowCount: 10,
    columnCount: 1,
    generatedAt: 0,
    columns: [{ name: "name", type: "VARCHAR", kind: "text", nullCount: 0, nullPercent: 0, distinctCount: 9, min: null, max: null, avg: null, topValues: [] }],
  });
  assert.equal(profiled.unique, false);
});
