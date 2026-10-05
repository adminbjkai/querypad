import assert from "node:assert/strict";
import test from "node:test";
import { dropAllSql, isReadOnlyStatement, mutationTargets, relationshipsSql, snapshotSelectSql } from "../src/lib/duckdb/catalog-sql";
import { relationshipKey } from "../src/lib/discovery/relationships";
import { createNodeDb } from "../src/lib/duckdb-node/connection";
import type { Relationship } from "../src/types/discovery";

test("read-only statements are recognised, mutations are not", () => {
  for (const sql of ["SELECT 1", "  -- note\nWITH x AS (SELECT 1) SELECT * FROM x", "/* c */ describe t", "FROM t", "EXPLAIN SELECT 1", "SUMMARIZE t", "values (1)"]) {
    assert.equal(isReadOnlyStatement(sql), true, sql);
  }
  for (const sql of ["CREATE TABLE t AS SELECT 1", "insert into t values (1)", "DROP TABLE t", "ALTER TABLE t ADD COLUMN x INT", "UPDATE t SET a = 1", "CREATE VIEW v AS SELECT 1", "-- c\nDELETE FROM t"]) {
    assert.equal(isReadOnlyStatement(sql), false, sql);
  }
});

test("mutationTargets finds the tables a batch writes to", () => {
  const targets = mutationTargets([
    "CREATE OR REPLACE TABLE employee_bio AS SELECT 1",
    'INSERT INTO "My Table" VALUES (1)',
    "update main.Orders set x = 1",
    "DELETE FROM t1 WHERE a = 1",
    "ALTER TABLE IF EXISTS t2 ADD COLUMN c INT",
    "TRUNCATE t3",
    "COPY t4 FROM 'x.csv'",
    "SELECT * FROM ignored",
    "CREATE TABLE IF NOT EXISTS t5 (a INT)",
  ]);
  assert.deepEqual([...targets].sort(), ["employee_bio", "my table", "orders", "t1", "t2", "t3", "t4", "t5"]);
});

const rels: Relationship[] = [
  {
    from: { table: "employees", column: "dept_id" },
    to: { table: "departments", column: "dept_id" },
    confidence: 100,
    cardinality: "many-to-one",
    signals: { valueOverlap: 1, nameSimilarity: 1, typeMatch: 1, cardinalityShape: 1 },
  },
  {
    from: { table: "bio", column: "emp's id" },
    to: { table: "employees", column: "emp_id" },
    confidence: 62,
    cardinality: "one-to-one",
    signals: { valueOverlap: 1, nameSimilarity: 0.5, typeMatch: 1, cardinalityShape: 0.5 },
  },
];

test("relationshipsSql publishes queryable keys and relationships in DuckDB", async () => {
  const db = await createNodeDb();
  try {
    const verdicts = { [relationshipKey(rels[1])]: "rejected" as const };
    for (const statement of relationshipsSql(rels, verdicts, relationshipKey)) await db.runner(statement);
    const published = await db.runner("SELECT from_table, from_column, status, confidence FROM querypad.relationships ORDER BY from_table");
    assert.deepEqual(
      published.map((r) => [r.from_table, r.from_column, r.status, Number(r.confidence)]),
      [
        ["bio", "emp's id", "rejected", 62],
        ["employees", "dept_id", "inferred", 100],
      ]
    );
    const keys = await db.runner("SELECT table_name, column_name, key_type FROM querypad.keys ORDER BY table_name, key_type");
    // Rejected joins contribute no keys.
    assert.deepEqual(
      keys.map((r) => [r.table_name, r.column_name, r.key_type]),
      [
        ["departments", "dept_id", "primary key"],
        ["employees", "dept_id", "foreign key"],
      ]
    );
    // Republishing (e.g. after a verdict change) replaces rather than duplicates.
    for (const statement of relationshipsSql(rels, {}, relationshipKey)) await db.runner(statement);
    const count = await db.runner("SELECT COUNT(*) AS n FROM querypad.relationships");
    assert.equal(Number(count[0].n), 2);

    // Reset removes user objects and the querypad schema.
    await db.runner("CREATE TABLE t AS SELECT 1 AS a");
    await db.runner("CREATE VIEW v AS SELECT * FROM t");
    for (const statement of dropAllSql(["t"], ["v"])) await db.runner(statement);
    const left = await db.runner(
      "SELECT COUNT(*) AS n FROM duckdb_tables() WHERE NOT internal AND NOT temporary"
    );
    assert.equal(Number(left[0].n), 0);
  } finally {
    db.close();
  }
});

test("an empty relationship set still creates queryable (empty) tables", async () => {
  const db = await createNodeDb();
  try {
    for (const statement of relationshipsSql([], {}, relationshipKey)) await db.runner(statement);
    const rows = await db.runner("SELECT * FROM querypad.keys");
    assert.equal(rows.length, 0);
  } finally {
    db.close();
  }
});

test("WITH-wrapped writes are not read-only and report their target", () => {
  const insert = "WITH src AS (SELECT 1 AS a) INSERT INTO totals SELECT * FROM src";
  const update = "with x as (select 1) update Orders set a = 1";
  assert.equal(isReadOnlyStatement(insert), false);
  assert.equal(isReadOnlyStatement(update), false);
  assert.equal(isReadOnlyStatement("WITH x AS (SELECT 1 AS a) SELECT * FROM x"), true);
  assert.deepEqual([...mutationTargets([insert, update])], ["totals", "orders"]);
});

test("snapshots keep 128-bit integers exact and unions readable in Parquet", async () => {
  const db = await createNodeDb();
  try {
    await db.runner(
      "CREATE TABLE totals AS SELECT 'a' AS k, SUM(x)::HUGEINT AS total, union_value(n := 1)::UNION(n INTEGER, s VARCHAR) AS u FROM range(3) t(x)"
    );
    const columns = (await db.runner("DESCRIBE totals")).map((r) => ({ name: String(r.column_name), type: String(r.column_type) }));
    const select = snapshotSelectSql("totals", columns);
    assert.match(select, /CAST\("total" AS DECIMAL\(38,0\)\)/);
    assert.match(select, /FROM main\."totals"$/);
    const file = `/tmp/qp-snapshot-test-${process.pid}.parquet`;
    await db.runner(`COPY (${select}) TO '${file}' (FORMAT PARQUET)`);
    await db.runner(`CREATE TABLE restored AS SELECT * FROM read_parquet('${file}')`);
    const rows = await db.runner("SELECT CAST(total AS VARCHAR) AS total, u FROM restored");
    assert.equal(rows[0].total, "3");
    assert.equal(String(rows[0].u), "1");
  } finally {
    db.close();
  }
});
