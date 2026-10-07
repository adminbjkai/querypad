import type { ProfileColumnKind } from "../../types";

/** Quote a SQL identifier (table or column name), escaping embedded double quotes. */
export function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

const NUMERIC_TYPES = new Set([
  "TINYINT", "SMALLINT", "INTEGER", "INT", "BIGINT", "HUGEINT",
  "UTINYINT", "USMALLINT", "UINTEGER", "UBIGINT", "UHUGEINT",
  "INT1", "INT2", "INT4", "INT8", "INT16", "INT32", "INT64", "INT128",
  "DOUBLE", "FLOAT", "FLOAT4", "FLOAT8", "REAL", "DECIMAL", "NUMERIC",
  // Arrow spellings, as reported for query result columns
  "UINT8", "UINT16", "UINT32", "UINT64", "FLOAT16", "FLOAT32", "FLOAT64",
]);

/**
 * Bucket a DuckDB column type into a coarse kind used for profiling, discovery and UI.
 * Matches on the base type name, so nested types (STRUCT, LIST, MAP, INTEGER[]) and
 * INTERVAL are not mistaken for numbers.
 */
export function classifyType(type: string): ProfileColumnKind {
  const normalized = type.trim().toUpperCase();
  if (normalized.endsWith("]") || /^(STRUCT|MAP|UNION|LIST)\b/.test(normalized)) return "other";
  const base = normalized.replace(/[([<].*$/, "").trim();
  if (NUMERIC_TYPES.has(base)) return "numeric";
  if (/^(TIMESTAMP|DATE|TIME|INTERVAL)/.test(base)) return "date";
  if (base.startsWith("BOOL")) return "boolean";
  if (/^(VARCHAR|CHAR|BPCHAR|TEXT|STRING|UUID|JSON|ENUM|UTF8|LARGEUTF8)/.test(base)) return "text";
  return "other";
}

/** Quote a SQL string literal, escaping embedded single quotes. */
export function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
