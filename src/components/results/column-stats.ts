import type { ProfileColumnKind, QueryResult } from "@/types";
import { formatValue } from "@/lib/utils";
import { classifyType } from "@/lib/duckdb/sql-utils";

export interface ColumnStats {
  kind: ProfileColumnKind;
  type: string;
  total: number;
  nulls: number;
  distinct: number;
  min: string | null;
  max: string | null;
  mean: number | null;
  top: { label: string; count: number }[];
  /** Equal-width bins over [minNum, maxNum]; only for numeric columns with data. */
  histogram: { from: number; to: number; count: number }[] | null;
  /** Histogram bounds are epoch milliseconds (date columns) rather than plain numbers. */
  histogramIsDate: boolean;
}

const BINS = 20;

/** Compute column statistics client-side from the (already limited) result rows. */
export function computeColumnStats(result: QueryResult, column: string): ColumnStats {
  const index = result.columns.indexOf(column);
  const type = result.columnTypes[index] ?? "";
  const kind = classifyType(type);
  const total = result.rows.length;

  let nulls = 0;
  const counts = new Map<string, number>();
  const nums: number[] = [];
  const times: number[] = [];
  let min: string | null = null;
  let max: string | null = null;

  for (const row of result.rows) {
    const value = row[column];
    if (value === null || value === undefined) {
      nulls++;
      continue;
    }
    const label = formatValue(value);
    counts.set(label, (counts.get(label) ?? 0) + 1);
    if (kind === "numeric" && typeof value === "number" && Number.isFinite(value)) nums.push(value);
    else if (kind === "numeric" && typeof value === "bigint") nums.push(Number(value));
    else if (kind === "date" && typeof value === "string") {
      if (min === null || value < min) min = value;
      if (max === null || value > max) max = value;
      const t = Date.parse(value);
      if (Number.isFinite(t)) times.push(t);
    }
  }

  const histogramIsDate = nums.length === 0 && times.length > 0;
  const points = histogramIsDate ? times : nums;
  let mean: number | null = null;
  let histogram: ColumnStats["histogram"] = null;
  if (points.length > 0) {
    let lo = points[0];
    let hi = points[0];
    let sum = 0;
    for (const n of points) {
      if (n < lo) lo = n;
      if (n > hi) hi = n;
      sum += n;
    }
    if (!histogramIsDate) {
      mean = sum / points.length;
      min = formatValue(lo);
      max = formatValue(hi);
    }
    const bins = lo === hi ? 1 : BINS;
    const width = (hi - lo) / bins || 1;
    const filled = Array.from({ length: bins }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, count: 0 }));
    for (const n of points) filled[Math.min(bins - 1, Math.floor((n - lo) / width))].count++;
    histogram = filled;
  }

  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));

  return { kind, type, total, nulls, distinct: counts.size, min, max, mean, top, histogram, histogramIsDate };
}

const cache = new WeakMap<QueryResult, Map<string, ColumnStats>>();

/** Memoized per result object, so the pane and the expanded view never compute a column twice. */
export function getColumnStats(result: QueryResult, column: string): ColumnStats {
  let perResult = cache.get(result);
  if (!perResult) cache.set(result, (perResult = new Map()));
  let stats = perResult.get(column);
  if (!stats) perResult.set(column, (stats = computeColumnStats(result, column)));
  return stats;
}

export function peekColumnStats(result: QueryResult, column: string): ColumnStats | undefined {
  return cache.get(result)?.get(column);
}
