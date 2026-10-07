import type { Relationship, RelationshipVerdict } from "../../types/discovery";
import { quoteIdent, sqlString } from "./sql-utils";

/** Statements that only read; anything else may change the catalog or table contents. */
const READ_ONLY = /^(select|with|from|values|table|explain|describe|desc|show|summarize|pragma\s+(table_info|show|database_list))\b/i;

/** A CTE can wrap a write: `WITH x AS (…) INSERT INTO t …` (also UPDATE/DELETE). */
const WITH_WRITE = /^with\b[\s\S]*\b(insert\s+into|update|delete\s+from)\s/i;

/** Strip leading whitespace and comments so the first keyword can be inspected. */
export function leading(statement: string): string {
  return statement.replace(/^(\s+|--[^\n]*\n?|\/\*[\s\S]*?\*\/)+/, "");
}

export function isReadOnlyStatement(statement: string): boolean {
  const text = leading(statement);
  return READ_ONLY.test(text) && !WITH_WRITE.test(text);
}

function unquote(identifier: string): string {
  const last = identifier.split(".").pop() ?? identifier;
  return last.startsWith('"') ? last.slice(1, -1).replaceAll('""', '"') : last;
}

const IDENT = String.raw`("(?:[^"]|"")+"|[\w$]+)(?:\.("(?:[^"]|"")+"|[\w$]+))?`;
const TARGET_PATTERNS = [
  new RegExp(String.raw`^insert\s+(?:or\s+\w+\s+)?into\s+${IDENT}`, "i"),
  new RegExp(String.raw`^update\s+${IDENT}`, "i"),
  new RegExp(String.raw`^delete\s+from\s+${IDENT}`, "i"),
  new RegExp(String.raw`^truncate\s+(?:table\s+)?${IDENT}`, "i"),
  new RegExp(String.raw`^alter\s+table\s+(?:if\s+exists\s+)?${IDENT}`, "i"),
  new RegExp(String.raw`^create\s+(?:or\s+replace\s+)?table\s+(?:if\s+not\s+exists\s+)?${IDENT}`, "i"),
  new RegExp(String.raw`^copy\s+${IDENT}\s+from\b`, "i"),
];
/** Statements that change the catalog without rewriting rows of an existing table. */
const CATALOG_ONLY = /^(?:create\s+(?:or\s+replace\s+)?(?:temp(?:orary)?\s+)?(?:view|schema|index|macro|function|sequence|type)\b|drop\s+|comment\s+on\b|set\s+|reset\s+|pragma\s+|checkpoint\b|vacuum\b|analyze\b|begin\b|commit\b|rollback\b|install\s+|load\s+)/i;
/** The write inside a `WITH … INSERT/UPDATE/DELETE` statement. */
const WITH_TARGET = new RegExp(String.raw`\b(?:insert\s+(?:or\s+\w+\s+)?into|update|delete\s+from)\s+${IDENT}`, "i");

/**
 * Lower-cased names of tables a batch of statements writes to, so their saved
 * snapshots can be refreshed. Schema-qualified names keep only the table part.
 * Returns `null` when some write isn't understood (MERGE, EXECUTE, CALL …): the
 * caller must then treat every table as possibly changed rather than trust the list.
 */
export function mutationTargets(statements: string[]): Set<string> | null {
  const targets = new Set<string>();
  for (const statement of statements) {
    if (isReadOnlyStatement(statement)) continue;
    const text = leading(statement);
    if (WITH_WRITE.test(text)) {
      const match = text.match(WITH_TARGET);
      if (!match) return null;
      targets.add(unquote(match[2] ?? match[1]).toLowerCase());
      continue;
    }
    let known = CATALOG_ONLY.test(text);
    for (const pattern of TARGET_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        targets.add(unquote(match[2] ?? match[1]).toLowerCase());
        known = true;
        break;
      }
    }
    if (!known) return null;
  }
  return targets;
}

/**
 * The SELECT used to snapshot a table to Parquet. Parquet has no 128-bit integers or
 * unions, so HUGEINT/UHUGEINT (e.g. SUM of integers) become DECIMAL(38,0) — exact — and
 * UNION columns become text instead of an unreadable file. Always reads `main.<table>`
 * so a temporary table with the same name can't shadow it.
 */
export function snapshotSelectSql(table: string, columns: { name: string; type: string }[]): string {
  const list = columns.map(({ name, type }) => {
    const column = quoteIdent(name);
    if (/^U?HUGEINT$/i.test(type)) return `CAST(${column} AS DECIMAL(38,0)) AS ${column}`;
    if (/^UNION\(/i.test(type)) return `CAST(${column} AS VARCHAR) AS ${column}`;
    return column;
  });
  return `SELECT ${list.length > 0 ? list.join(", ") : "*"} FROM main.${quoteIdent(table)}`;
}

type RelationshipStatus = "accepted" | "inferred" | "rejected";

/**
 * SQL that (re)publishes the inferred join graph inside DuckDB so it can be queried:
 *   querypad.relationships — one row per inferred foreign key, with its status
 *   querypad.keys          — every key column (inferred primary keys and foreign keys)
 * Loaded files carry no declared PRIMARY/FOREIGN KEY constraints, so
 * information_schema can't answer "how do my tables connect" — these tables can.
 */
export function relationshipsSql(
  relationships: Relationship[],
  verdicts: Record<string, RelationshipVerdict>,
  keyOf: (rel: Relationship) => string
): string[] {
  const rows = relationships.map((rel) => {
    const verdict = verdicts[keyOf(rel)];
    const status: RelationshipStatus = verdict === "accepted" ? "accepted" : verdict === "rejected" ? "rejected" : "inferred";
    return `(${[rel.from.table, rel.from.column, rel.to.table, rel.to.column, rel.cardinality]
      .map(sqlString)
      .join(", ")}, ${Math.round(rel.confidence)}, ${sqlString(status)})`;
  });
  const statements = [
    "CREATE SCHEMA IF NOT EXISTS querypad",
    `CREATE OR REPLACE TABLE querypad.relationships (
  from_table VARCHAR, from_column VARCHAR, to_table VARCHAR, to_column VARCHAR,
  cardinality VARCHAR, confidence INTEGER, status VARCHAR)`,
  ];
  if (rows.length > 0) statements.push(`INSERT INTO querypad.relationships VALUES ${rows.join(", ")}`);
  statements.push(`CREATE OR REPLACE VIEW querypad.keys AS
SELECT DISTINCT to_table AS table_name, to_column AS column_name, 'primary key' AS key_type,
       NULL AS references_table, NULL AS references_column, status
FROM querypad.relationships WHERE status <> 'rejected'
UNION ALL
SELECT from_table, from_column, 'foreign key', to_table, to_column, status
FROM querypad.relationships WHERE status <> 'rejected'
ORDER BY table_name, key_type DESC, column_name`);
  return statements;
}

/** Drop statements for everything a user can create in the main schema. */
export function dropAllSql(tables: string[], views: string[]): string[] {
  return [
    ...views.map((v) => `DROP VIEW IF EXISTS ${quoteIdent(v)} CASCADE`),
    ...tables.map((t) => `DROP TABLE IF EXISTS ${quoteIdent(t)} CASCADE`),
    "DROP SCHEMA IF EXISTS querypad CASCADE",
  ];
}
