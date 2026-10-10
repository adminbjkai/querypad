import { formatValue } from "@/lib/utils";
import { toNumber } from "@/lib/discovery/numbers";

export interface RangeStats {
  cells: number;
  nulls: number;
  /** Numeric cells in the range; sum/avg/min/max are null when there are none. */
  numericCount: number;
  sum: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
  distinct: number;
}

/** Aggregate a rectangular range. Runs on demand only (selection changes), never during scroll. */
export function computeRangeStats(
  rows: Record<string, unknown>[],
  columns: string[],
  r1: number,
  r2: number,
  c1: number,
  c2: number
): RangeStats {
  let cells = 0;
  let nulls = 0;
  let numericCount = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  const seen = new Set<string>();
  for (let c = c1; c <= c2; c++) {
    const key = columns[c];
    for (let r = r1; r <= r2; r++) {
      const v = rows[r]?.[key];
      cells++;
      if (v === null || v === undefined) {
        nulls++;
        continue;
      }
      const n = toNumber(v);
      if (n !== null) {
        numericCount++;
        sum += n;
        if (n < min) min = n;
        if (n > max) max = n;
      }
      if (seen.size < 100_000) seen.add(typeof v === "number" ? String(v) : formatValue(v));
    }
  }
  return {
    cells,
    nulls,
    numericCount,
    sum: numericCount ? sum : null,
    avg: numericCount ? sum / numericCount : null,
    min: numericCount ? min : null,
    max: numericCount ? max : null,
    distinct: seen.size,
  };
}

/** Locale digits with at most four decimals (integers stay exact). */
export const formatNumber = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });

/** Tab-separated text of a range; values with tabs, quotes or newlines are quoted like a spreadsheet would. */
export function rangeToTsv(
  rows: Record<string, unknown>[],
  columns: string[],
  r1: number,
  r2: number,
  c1: number,
  c2: number,
  withHeader: boolean
): string {
  const esc = (s: string) => (/[\t\n\r"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines: string[] = [];
  if (withHeader) lines.push(columns.slice(c1, c2 + 1).map(esc).join("\t"));
  for (let r = r1; r <= r2; r++) {
    const parts: string[] = [];
    for (let c = c1; c <= c2; c++) {
      const v = rows[r]?.[columns[c]];
      parts.push(v === null || v === undefined ? "" : esc(formatValue(v)));
    }
    lines.push(parts.join("\t"));
  }
  return lines.join("\n");
}
