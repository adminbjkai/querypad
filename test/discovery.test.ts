import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  cardinalityShapeScore,
  confidence,
  isTypeCompatible,
  nameSimilarity,
  singularize,
  splitTokens,
  typeMatchScore,
} from "../src/lib/discovery/signals";
import { discoverRelationships, relationshipKey } from "../src/lib/discovery/relationships";
import { createNodeDb } from "../src/lib/duckdb-node/connection";
import { loadFolder } from "../src/lib/duckdb-node/load";
import { profileTable } from "../src/lib/duckdb-node/profile";

// ---- Pure signal unit tests ---------------------------------------------------

test("relationshipKey is directional and stable", () => {
  const forward = relationshipKey({
    from: { table: "payments", column: "user_id" },
    to: { table: "users", column: "id" },
    confidence: 100,
    cardinality: "many-to-one",
    signals: { valueOverlap: 1, nameSimilarity: 1, typeMatch: 1, cardinalityShape: 1 },
  });
  const reversed = relationshipKey({
    from: { table: "users", column: "id" },
    to: { table: "payments", column: "user_id" },
    confidence: 100,
    cardinality: "many-to-one",
    signals: { valueOverlap: 1, nameSimilarity: 1, typeMatch: 1, cardinalityShape: 1 },
  });
  assert.equal(forward, "payments.user_id->users.id");
  assert.notEqual(forward, reversed);
});

test("splitTokens handles snake_case and camelCase", () => {
  assert.deepEqual(splitTokens("user_id"), ["user", "id"]);
  assert.deepEqual(splitTokens("customerId"), ["customer", "id"]);
});

test("singularize covers common plural forms", () => {
  assert.equal(singularize("users"), "user");
  assert.equal(singularize("companies"), "company");
  assert.equal(singularize("addresses"), "address");
});

test("nameSimilarity rewards canonical FK conventions", () => {
  // events.user_id ↳ users.id
  assert.equal(nameSimilarity("user_id", "id", "users"), 1);
  // payments.customer_id ↳ subscriptions.customer_id
  assert.equal(nameSimilarity("customer_id", "customer_id", "subscriptions"), 1);
});

test("nameSimilarity stays weak for bare surrogate ids", () => {
  // events.id vs payments.id — only the shared "id" token
  assert.ok(nameSimilarity("id", "id", "payments") < 0.6);
  // payments.user_id vs events.id — wrong table reference
  assert.ok(nameSimilarity("user_id", "id", "events") < 0.6);
});

test("type compatibility and match scoring", () => {
  assert.ok(isTypeCompatible("numeric", "numeric"));
  assert.ok(isTypeCompatible("numeric", "text"));
  assert.ok(!isTypeCompatible("numeric", "date"));
  assert.equal(typeMatchScore("BIGINT", "BIGINT", "numeric", "numeric"), 1);
  assert.equal(typeMatchScore("INTEGER", "BIGINT", "numeric", "numeric"), 0.85);
});

test("cardinality shape distinguishes many-to-one from one-to-one", () => {
  assert.equal(cardinalityShapeScore(true, false), 1);
  assert.equal(cardinalityShapeScore(true, true), 0.8);
  assert.equal(cardinalityShapeScore(false, false), 0);
});

test("confidence is 100 for a perfect FK and lower for a weak name", () => {
  assert.equal(
    confidence({ valueOverlap: 1, nameSimilarity: 1, typeMatch: 1, cardinalityShape: 1 }),
    100
  );
  const weakName = confidence({
    valueOverlap: 1,
    nameSimilarity: 0.33,
    typeMatch: 1,
    cardinalityShape: 1,
  });
  assert.ok(weakName < 90 && weakName > 50);
});

// ---- Engine integration test (real Node DuckDB over fixtures) ------------------

test("inspect fixtures yields exactly the two true relationships", async () => {
  const folder = path.resolve(process.cwd(), "fixtures/data");
  const db = await createNodeDb();
  try {
    const { tables } = await loadFolder(folder, db.runner);
    assert.equal(tables.length, 3);

    const now = 1_700_000_000_000;
    const profiles = [];
    for (const table of tables) {
      profiles.push(await profileTable(table, db.runner, now));
    }

    const relationships = await discoverRelationships(profiles, db.runner);
    const edges = relationships.map(
      (rel) => `${rel.from.table}.${rel.from.column}->${rel.to.table}.${rel.to.column}`
    );

    assert.deepEqual(
      new Set(edges),
      new Set(["payments.user_id->users.id", "events.user_id->users.id"])
    );
    for (const rel of relationships) {
      assert.equal(rel.confidence, 100);
      assert.equal(rel.cardinality, "many-to-one");
    }
    // No spurious edges into surrogate id columns of other tables.
    assert.ok(!edges.some((edge) => edge.endsWith("events.id")));
    assert.ok(!edges.some((edge) => edge.endsWith("payments.id")));
  } finally {
    db.close();
  }
});

// ---- non-id join targets (ported from upstream 22078d0) ----------------------------

test("a coincidentally unique price column is not a join target", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const dir = await mkdtemp(path.join(tmpdir(), "querypad-fk-target-"));
  // A small price list has unique prices, so it passes the unique + non-null key test.
  await writeFile(path.join(dir, "price_list.csv"), "id,sku,list_amt\n1,A,10.00\n2,B,20.00\n3,C,30.00\n4,D,40.00\n");
  // line_amt holds the same values by coincidence. It is a measure, not a key.
  await writeFile(
    path.join(dir, "sales.csv"),
    "id,sku,line_amt\n1,A,10.00\n2,B,20.00\n3,A,10.00\n4,C,30.00\n5,D,40.00\n6,B,20.00\n"
  );

  const db = await createNodeDb();
  try {
    const { tables } = await loadFolder(dir, db.runner);
    const profiles = [];
    for (const table of tables) profiles.push(await profileTable(table, db.runner, 1));
    const keys = (await discoverRelationships(profiles, db.runner)).map(relationshipKey);

    assert.ok(keys.includes("sales.sku->price_list.sku"), `expected the natural-key join, got ${keys}`);
    assert.ok(
      !keys.includes("sales.line_amt->price_list.list_amt"),
      `value overlap alone must not make a price a join target, got ${keys}`
    );
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("an empty table (CREATE TABLE … WHERE FALSE) is linked by name, flagged as name-only", async () => {
  const db = await createNodeDb();
  try {
    await db.runner("CREATE TABLE employees AS SELECT i AS emp_id, 'n' || i AS name FROM range(1, 13) t(i)");
    await db.runner(
      "CREATE TABLE employee_bio AS SELECT emp_id, CAST(NULL AS VARCHAR) AS birth_country, CAST(NULL AS DATE) AS birth_date FROM employees WHERE FALSE"
    );
    const profiles = [];
    for (const name of ["employees", "employee_bio"]) {
      const columns = (await db.runner(`DESCRIBE ${name}`)).map((r) => ({ name: String(r.column_name), type: String(r.column_type) }));
      const rowCount = Number((await db.runner(`SELECT COUNT(*) AS n FROM ${name}`))[0].n);
      profiles.push(await profileTable({ name, columns, rowCount }, db.runner, 1));
    }
    const rels = await discoverRelationships(profiles, db.runner);
    assert.equal(rels.length, 1, JSON.stringify(rels));
    assert.equal(relationshipKey(rels[0]), "employee_bio.emp_id->employees.emp_id");
    assert.equal(rels[0].evidence, "name");
    assert.ok(rels[0].confidence >= 50 && rels[0].confidence <= 60, `confidence ${rels[0].confidence}`);
  } finally {
    db.close();
  }
});
