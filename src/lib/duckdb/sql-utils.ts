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

/** Blank out comments and string/identifier literals so keyword checks see only SQL. */
export function stripSqlLiterals(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""');
}

/**
 * Where each statement of a script sits: `[start, end)` ranges that end just past their `;` (the
 * last one at the end of the text). A `;` only separates statements outside string literals
 * (`'…'` with `''`, `E'…'` with backslash escapes), quoted identifiers (`"…"` with `""`),
 * dollar-quoted strings (`$$…$$`, `$tag$…$tag$`), line comments and (nested) block comments.
 */
export function statementRanges(sql: string): [number, number][] {
  const ranges: [number, number][] = [];
  let start = 0;
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    if (ch === "'") {
      const escapes = i > 0 && (sql[i - 1] === "E" || sql[i - 1] === "e") && !/[\w$]/.test(sql[i - 2] ?? "");
      i++;
      while (i < n) {
        if (escapes && sql[i] === "\\") i += 2;
        else if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") { i++; break; }
        else i++;
      }
      continue;
    }
    if (ch === '"') {
      i++;
      while (i < n) {
        if (sql[i] === '"' && sql[i + 1] === '"') i += 2;
        else if (sql[i] === '"') { i++; break; }
        else i++;
      }
      continue;
    }
    if (ch === "$" && !/[\w$]/.test(sql[i - 1] ?? "")) {
      const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 66));
      if (tag) {
        const close = sql.indexOf(tag[0], i + tag[0].length);
        i = close === -1 ? n : close + tag[0].length;
        continue;
      }
    }
    if (ch === "-" && sql[i + 1] === "-") {
      while (i < n && sql[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") { depth++; i += 2; }
        else if (sql[i] === "*" && sql[i + 1] === "/") { depth--; i += 2; }
        else i++;
      }
      continue;
    }
    i++;
    if (ch === ";") {
      ranges.push([start, i]);
      start = i;
    }
  }
  if (start < n) ranges.push([start, n]);
  return ranges;
}
