import type { ProfileColumnKind } from "../../types";

export type SortDir = "asc" | "desc";

/** The grid's current sort, or null for the query's own order. */
export type SortState = { column: string; dir: SortDir } | null;

const isNull = (v: unknown) => v === null || v === undefined;

/** Numeric sort key for numbers, bigints and ISO date/time strings; null when the value has none. */
function numericKey(v: unknown, kind: ProfileColumnKind): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "bigint") return Number(v);
  if (kind === "date" && typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  if (kind === "numeric" && typeof v === "string") {
    const n = Number(v);
    return v.trim() !== "" && Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Sort rows by one column. Numbers and dates compare as numbers, everything else through a single
 * natural-order collator; NULLs always sort last regardless of direction. Keys are computed once per
 * row (decorate–sort–undecorate) so large results never re-parse or re-stringify values per comparison.
 */
export function sortRows<T extends Record<string, unknown>>(rows: T[], column: string, dir: SortDir, kind: ProfileColumnKind): T[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const factor = dir === "asc" ? 1 : -1;
  const asNumber = kind === "numeric" || kind === "date";
  const keyed = rows.map((row, index) => {
    const v = row[column];
    const num = asNumber ? numericKey(v, kind) : null;
    return { row, index, nul: isNull(v), num, str: num === null && !isNull(v) ? String(v) : "" };
  });
  keyed.sort((a, b) => {
    if (a.nul || b.nul) return a.nul === b.nul ? a.index - b.index : a.nul ? 1 : -1;
    let c: number;
    if (a.num !== null && b.num !== null) c = a.num - b.num;
    else if (a.num !== null || b.num !== null) c = a.num !== null ? -1 : 1; // numbers before unparsable text
    else c = collator.compare(a.str, b.str);
    return c === 0 ? a.index - b.index : c * factor;
  });
  return keyed.map((k) => k.row);
}
