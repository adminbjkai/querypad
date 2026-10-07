import assert from "node:assert/strict";
import test from "node:test";
import { sortRows } from "../src/components/results/sort";

const col = (values: unknown[]) => values.map((v) => ({ v }));
const pick = (rows: { v: unknown }[]) => rows.map((r) => r.v);

test("numeric columns compare as numbers with NULLs last in both directions", () => {
  const rows = col([10, null, 2, BigInt(33), 1.5]);
  assert.deepEqual(pick(sortRows(rows, "v", "asc", "numeric")), [1.5, 2, 10, BigInt(33), null]);
  assert.deepEqual(pick(sortRows(rows, "v", "desc", "numeric")), [BigInt(33), 10, 2, 1.5, null]);
});

test("date columns compare chronologically, not lexically", () => {
  const rows = col(["2024-02-01T00:00:00.000Z", "2023-12-31", null, "2024-01-15"]);
  assert.deepEqual(pick(sortRows(rows, "v", "asc", "date")), ["2023-12-31", "2024-01-15", "2024-02-01T00:00:00.000Z", null]);
});

test("text columns use natural, case-insensitive order and keep the input order for ties", () => {
  const rows = [
    { v: "item10", id: 1 },
    { v: "Item2", id: 2 },
    { v: "item2", id: 3 },
    { v: null, id: 4 },
    { v: "item1", id: 5 },
  ];
  const asc = sortRows(rows, "v", "asc", "text");
  assert.deepEqual(asc.map((r) => r.id), [5, 2, 3, 1, 4]);
  const desc = sortRows(rows, "v", "desc", "text");
  assert.deepEqual(desc.map((r) => r.id), [1, 2, 3, 5, 4]);
});

test("does not mutate the input", () => {
  const rows = col([3, 1, 2]);
  sortRows(rows, "v", "asc", "numeric");
  assert.deepEqual(pick(rows), [3, 1, 2]);
});
