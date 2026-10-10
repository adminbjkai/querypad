import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DataType,
  DateDay,
  Decimal,
  Field,
  Int32,
  Int64,
  List,
  makeData,
  RecordBatch,
  Schema,
  Struct,
  TimestampMillisecond,
  Utf8,
  vectorFromArray,
  type Data,
} from "apache-arrow";
import { ResultCollector } from "../src/lib/duckdb/queries";

/** A record batch with the given columns (names may repeat, as in `SELECT 1 AS a, 2 AS a`). */
function batchOf(columns: [string, Data][]): RecordBatch {
  const fields = columns.map(([name, data]) => new Field(name, data.type, true));
  const length = columns[0][1].length;
  return new RecordBatch(new Schema(fields), makeData({ type: new Struct(fields), length, nullCount: 0, children: columns.map(([, data]) => data) }));
}

const col = (values: unknown[], type: DataType): Data => vectorFromArray(values as never, type as never).data[0];

test("keeps rows up to the cap but counts every batch", () => {
  const batches = [0, 3, 6, 9].map((from) => batchOf([["i", col([from, from + 1, from + 2], new Int32())]]));
  const collector = new ResultCollector(batches[0].schema, 5);
  for (const b of batches) collector.add(b);
  assert.equal(collector.rowCount, 12);
  assert.deepEqual(collector.rows, [0, 1, 2, 3, 4].map((i) => ({ i })));
  assert.deepEqual(collector.columns, ["i"]);
  assert.deepEqual(collector.columnTypes, ["Int32"]);
});

test("converts values the way the grid expects", () => {
  const decimal = makeData({ type: new Decimal(2, 10, 128), length: 2, nullCount: 0, data: new Uint32Array([12345, 0, 0, 0, 7, 0, 0, 0]) });
  const b = batchOf([
    ["big", col([BigInt(1), null], new Int64())],
    ["d", col([new Date(Date.UTC(2024, 1, 29)), null], new DateDay())],
    ["ts", col([new Date(Date.UTC(2024, 0, 2, 3, 4, 5, 678)), null], new TimestampMillisecond())],
    ["s", col(["x", null], new Utf8())],
    ["l", col([[1, 2], null], new List(new Field("item", new Int32(), true)))],
    ["st", col([{ a: 1 }, null], new Struct([new Field("a", new Int32(), true)]))],
    ["dec", decimal],
  ]);
  const collector = new ResultCollector(b.schema);
  collector.add(b);
  const [first, second] = collector.rows;
  assert.equal(first.big, 1);
  assert.equal(first.d, "2024-02-29");
  assert.equal(first.ts, "2024-01-02T03:04:05.678Z");
  assert.equal(first.s, "x");
  assert.deepEqual([...(first.l as Iterable<number>)], [1, 2]);
  assert.deepEqual((first.st as { toJSON(): unknown }).toJSON(), { a: 1 });
  assert.equal(first.dec, 123.45);
  assert.equal(second.dec, 0.07);
  for (const key of ["big", "d", "ts", "s", "l", "st"]) assert.equal(second[key], null, key);
  assert.equal(collector.rowCount, 2);
});

test("a repeated column name reads the first column with that name", () => {
  const b = batchOf([
    ["a", col([1], new Int32())],
    ["a", col(["z"], new Utf8())],
  ]);
  const collector = new ResultCollector(b.schema);
  collector.add(b);
  assert.deepEqual(collector.columns, ["a", "a"]);
  assert.deepEqual(collector.rows, [{ a: 1 }]);
});
