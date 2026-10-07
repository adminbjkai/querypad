import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG_SIGNATURE_SQL } from "../src/lib/duckdb/catalog";
import { createNodeDb } from "../src/lib/duckdb-node/connection";

/** The one-query catalog signature matches DESCRIBE's column list and skips internals and the querypad schema. */
test("catalog signature query lists main-schema tables and views with DESCRIBE-shaped column signatures", async () => {
  const db = await createNodeDb();
  try {
    await db.runner("CREATE TABLE orders (id INTEGER, amount DECIMAL(18,3), note VARCHAR)");
    await db.runner("INSERT INTO orders VALUES (1, 2.5, 'x'), (2, 3.5, 'y')");
    await db.runner("CREATE VIEW order_ids AS SELECT id FROM orders");
    await db.runner("CREATE SCHEMA querypad");
    await db.runner("CREATE TABLE querypad.keys (k INTEGER)");

    const rows = await db.runner(CATALOG_SIGNATURE_SQL);
    const byName = new Map(rows.map((r) => [String(r.name), r]));
    assert.deepEqual([...byName.keys()].sort(), ["order_ids", "orders"]);
    assert.equal(byName.get("orders")?.signature, "id:INTEGER|amount:DECIMAL(18,3)|note:VARCHAR");
    assert.equal(Number(byName.get("orders")?.estimated_rows), 2);
    assert.equal(byName.get("order_ids")?.signature, "id:INTEGER");
    assert.equal(byName.get("order_ids")?.estimated_rows, null);

    const described = await db.runner("DESCRIBE orders");
    assert.equal(
      described.map((r) => `${r.column_name}:${r.column_type}`).join("|"),
      byName.get("orders")?.signature
    );

    await db.runner("ALTER TABLE orders ADD COLUMN shipped BOOLEAN");
    const after = await db.runner(CATALOG_SIGNATURE_SQL);
    assert.equal(after.find((r) => r.name === "orders")?.signature, "id:INTEGER|amount:DECIMAL(18,3)|note:VARCHAR|shipped:BOOLEAN");
  } finally {
    await db.close();
  }
});
