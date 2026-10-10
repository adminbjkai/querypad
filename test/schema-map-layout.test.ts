import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutMap, NODE_W, type MapObject } from "../src/lib/schema-map-layout";

const obj = (name: string): MapObject => ({ name, rowCount: 1, columns: [], view: false });
const ref = (from: string, to: string) => ({ from: { table: from, column: `${to}_id` }, to: { table: to, column: "id" } });

test("tables sit one column left of what they reference; loose tables come last", () => {
  const { placed } = layoutMap(
    [obj("regions"), obj("orders"), obj("customers"), obj("notes")],
    [ref("orders", "customers"), ref("customers", "regions")]
  );
  const x = Object.fromEntries(placed.map((p) => [p.name, p.x]));
  assert.ok(x.orders < x.customers && x.customers < x.regions, JSON.stringify(x));
  assert.ok(x.notes > x.regions, "a table without joins gets its own last column");
});

test("a reference cycle or self-reference does not hang and every object is placed once", () => {
  const { placed, width } = layoutMap([obj("a"), obj("b")], [ref("a", "b"), ref("b", "a"), ref("a", "a")]);
  assert.equal(placed.length, 2);
  assert.ok(width >= 2 * NODE_W);
});

test("many loose tables wrap into short columns instead of one tall one", () => {
  const { placed } = layoutMap(Array.from({ length: 9 }, (_, i) => obj(`t${i}`)), []);
  assert.equal(new Set(placed.map((p) => p.x)).size, 3);
});
