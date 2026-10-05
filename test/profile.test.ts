import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { normalizeValue, profileTableWith } from "../src/lib/discovery/profile";
import type { QueryRunner } from "../src/lib/discovery/relationships";
import { createNodeDb } from "../src/lib/duckdb-node/connection";
import { loadFolder } from "../src/lib/duckdb-node/load";

test("normalizeValue unwraps bigint, Date and valueOf wrappers", () => {
  assert.equal(normalizeValue(BigInt(5)), 5);
  assert.equal(normalizeValue(new Date("2024-01-02T00:00:00Z")), "2024-01-02T00:00:00.000Z");
  assert.equal(normalizeValue({ valueOf: () => BigInt(7) }), 7);
  assert.equal(normalizeValue(undefined), null);
  const opaque = { toString: () => "2024-01-02" };
  assert.equal(normalizeValue(opaque), opaque);
});

test("profileTableWith profiles fixtures in one stats scan per table", async () => {
  const folder = path.resolve(process.cwd(), "fixtures/data");
  const db = await createNodeDb();
  try {
    const { tables } = await loadFolder(folder, db.runner);
    const byName = new Map(tables.map((table) => [table.name, table]));

    const queries: string[] = [];
    const counting: QueryRunner = (sql) => {
      queries.push(sql);
      return db.runner(sql);
    };

    const users = await profileTableWith(counting, byName.get("users")!, 1);
    // One aggregate scan + one top-values query for each of the two text columns.
    assert.equal(queries.length, 3);
    assert.equal(users.rowCount, 5);
    assert.equal(users.columnCount, 3);
    assert.equal(users.generatedAt, 1);
    const id = users.columns.find((column) => column.name === "id")!;
    assert.equal(id.kind, "numeric");
    assert.equal(id.distinctCount, 5);
    assert.equal(id.nullCount, 0);
    assert.equal(id.min, 1);
    assert.equal(id.max, 5);
    assert.equal(id.avg, 3);
    const plan = users.columns.find((column) => column.name === "plan")!;
    assert.equal(plan.kind, "text");
    assert.equal(plan.distinctCount, 2);
    assert.deepEqual(plan.topValues, [
      { value: "paid", count: 3 },
      { value: "free", count: 2 },
    ]);

    const payments = await profileTableWith(db.runner, byName.get("payments")!, 1);
    const amount = payments.columns.find((column) => column.name === "amount")!;
    assert.equal(amount.min, 7.25);
    assert.equal(amount.max, 99.99);
    assert.ok(Math.abs((amount.avg ?? 0) - 35.7175) < 1e-9);
    assert.equal(amount.nullPercent, 0);
  } finally {
    db.close();
  }
});

test("profileTableWith falls back per column when the batched scan fails", async () => {
  const db = await createNodeDb();
  try {
    // STRUCT classifies as numeric (contains INT) and AVG() rejects it, failing the batch.
    await db.runner(`
      CREATE TABLE t AS SELECT * FROM (VALUES
        (1, {'a': 1}, DATE '2024-01-02'),
        (NULL, {'a': 2}, DATE '2023-05-06')
      ) v(n, st, d)
    `);
    const table = {
      name: "t",
      rowCount: 2,
      columns: [
        { name: "n", type: "INTEGER" },
        { name: "st", type: "STRUCT(a INTEGER)" },
        { name: "d", type: "DATE" },
      ],
    };
    const originalError = console.error;
    console.error = () => {};
    let profile;
    try {
      profile = await profileTableWith(db.runner, table, 1);
    } finally {
      console.error = originalError;
    }
    const [n, st, d] = profile.columns;
    assert.equal(n.nullCount, 1);
    assert.equal(n.nullPercent, 50);
    assert.equal(n.min, 1);
    assert.equal(st.distinctCount, 2);
    assert.equal(st.min, null);
    assert.equal(d.min, "2023-05-06");
    assert.equal(d.max, "2024-01-02");
  } finally {
    db.close();
  }
});

test("profileTableWith handles a table with no columns", async () => {
  const runner: QueryRunner = async () => {
    throw new Error("should not query");
  };
  const profile = await profileTableWith(runner, { name: "x", rowCount: 0, columns: [] }, 1);
  assert.equal(profile.columnCount, 0);
  assert.deepEqual(profile.columns, []);
});
