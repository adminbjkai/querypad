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
    else if (kind === "date" && typeof value === "string") {
      if (min === null || value < min) min = value;
      if (max === null || value > max) max = value;
    }
  }

  let mean: number | null = null;
  let histogram: ColumnStats["histogram"] = null;
  if (nums.length > 0) {
    let lo = nums[0];
    let hi = nums[0];
    let sum = 0;
    for (const n of nums) {
      if (n < lo) lo = n;
      if (n > hi) hi = n;
      sum += n;
    }
    mean = sum / nums.length;
    min = formatValue(lo);
    max = formatValue(hi);
    const bins = lo === hi ? 1 : BINS;
    const width = (hi - lo) / bins || 1;
    const filled = Array.from({ length: bins }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, count: 0 }));
    for (const n of nums) filled[Math.min(bins - 1, Math.floor((n - lo) / width))].count++;
    histogram = filled;
  }

  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));

  return { kind, type, total, nulls, distinct: counts.size, min, max, mean, top, histogram };
}
