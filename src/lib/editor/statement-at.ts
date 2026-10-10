import { statementRanges } from "../duckdb/sql-utils";

/** Text with comments and `;` removed: empty when a stretch holds no SQL. */
function stripNoise(text: string): string {
  return text
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/;/g, "")
    .trim();
}

/**
 * The SQL statement under a cursor (statements split as `statementRanges` does). A cursor right
 * after a `;`, or in the blanks after it with nothing else on that line, belongs to the statement
 * the `;` ends; a cursor in the blanks just before a statement on the same line belongs to that
 * statement. Returns the trimmed statement without its `;`, or null when there is no SQL.
 */
export function statementAt(sql: string, offset: number): string | null {
  const bounds = statementRanges(sql);
  if (bounds.length === 0) return null;
  const hasSql = (text: string) => stripNoise(text).length > 0;
  const at = Math.max(0, Math.min(offset, sql.length));
  let index = bounds.findIndex(([s, e]) => at >= s && at < e);
  if (index === -1) index = bounds.length - 1;

  if (index > 0) {
    const [start, end] = bounds[index];
    const lead = sql.slice(start, at);
    const lineEnd = sql.indexOf("\n", at);
    const rest = sql.slice(at, Math.min(end, lineEnd === -1 ? end : lineEnd));
    // Still on the line the previous statement ended, with nothing typed since its `;`: that one.
    if (!lead.includes("\n") && !hasSql(lead) && (lead.length === 0 || !hasSql(rest))) index--;
  }
  // Only blank space or comments around the cursor: the statement just before it is meant.
  while (index > 0 && !hasSql(sql.slice(bounds[index][0], bounds[index][1]))) index--;
  const text = sql.slice(bounds[index][0], bounds[index][1]).trim().replace(/;$/, "").trim();
  return hasSql(text) ? text : null;
}
