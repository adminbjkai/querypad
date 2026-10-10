import { test } from "node:test";
import assert from "node:assert/strict";
import { statementAt } from "../src/lib/editor/statement-at";
import { statementRanges } from "../src/lib/duckdb/sql-utils";

const SQL = `SELECT 1 AS a;
-- second
SELECT ';' AS semi, "x;y" FROM t; /* ; */
SELECT 3`;

test("statementAt picks the statement under the cursor, ignoring ; in literals and comments", () => {
  assert.equal(statementAt(SQL, 3), "SELECT 1 AS a");
  assert.equal(statementAt(SQL, SQL.indexOf("semi")), `-- second\nSELECT ';' AS semi, "x;y" FROM t`);
  assert.equal(statementAt(SQL, SQL.length), "/* ; */\nSELECT 3");
  assert.equal(statementAt(SQL, SQL.indexOf("SELECT 3") + 2), "/* ; */\nSELECT 3");
});

test("a cursor right after a separator or in trailing blanks belongs to the statement it ends", () => {
  const sql = "SELECT 1;\n\n  ";
  assert.equal(statementAt(sql, sql.length), "SELECT 1");
  assert.equal(statementAt(sql, sql.indexOf(";") + 1), "SELECT 1");
  assert.equal(statementAt("SELECT 1;  SELECT 2;", 9), "SELECT 1");
});

test("no SQL at all gives null", () => {
  assert.equal(statementAt("", 0), null);
  assert.equal(statementAt("  -- only a comment\n", 5), null);
});

test("a cursor just before a statement on the same line runs that statement", () => {
  assert.equal(statementAt("SELECT 1; SELECT 2", 10), "SELECT 2");
  assert.equal(statementAt("SELECT 1; SELECT 2", 9), "SELECT 1");
  assert.equal(statementAt("SELECT 1;   -- note\nSELECT 2", 11), "SELECT 1");
});

test("dollar quotes, E-strings, doubled quotes and nested comments never split a statement", () => {
  assert.equal(statementAt("SELECT $$a;b$$; SELECT 2", 3), "SELECT $$a;b$$");
  assert.equal(statementAt("SELECT $fn$ x ; y $fn$ AS body; SELECT 2", 3), "SELECT $fn$ x ; y $fn$ AS body");
  assert.equal(statementAt("SELECT E'it\\'s; x'; SELECT 2", 3), "SELECT E'it\\'s; x'");
  assert.equal(statementAt(`SELECT 'a'';b', "c"";d"; SELECT 2`, 3), `SELECT 'a'';b', "c"";d"`);
  assert.equal(statementAt("/* /* x */ ; */ SELECT 1; SELECT 2", 20), "/* /* x */ ; */ SELECT 1");
  // A column named like a price ($1 placeholders, prices in identifiers) is not a dollar quote.
  assert.deepEqual(statementRanges("SELECT a$b; SELECT 2").length, 2);
});
