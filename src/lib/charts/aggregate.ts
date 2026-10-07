import type { QueryResult } from "@/types";
import { columnShapes, type Aggregation, type ChartConfig, type DateBucket } from "./detect";
import { toNumber } from "@/lib/discovery/numbers";

export const MAX_SERIES = 12;
const MAX_X_VALUES = 1000;
const MAX_POINTS = 5000;
export const OTHER = "Other";

/** Palette order for series; every entry is a theme token. */
export const SERIES_COLORS = [
  "var(--accent)", "var(--join)", "var(--k-num)", "var(--k-text)", "var(--k-date)", "var(--k-bool)",
  "var(--ok)", "var(--danger)", "var(--warn)", "var(--k-other)", "var(--accent-hover)", "var(--muted)",
];
const OTHER_COLOR = "var(--faint)";

export const AGG_LABELS: Record<Aggregation, string> = {
  none: "None",
  sum: "Sum",
  avg: "Average",
  count: "Count",
  min: "Min",
  max: "Max",
  distinct: "Count distinct",
};

export interface SeriesInfo {
  /** Row property holding this series' value. */
  key: string;
  label: string;
  color: string;
}

export interface ChartData {
  series: SeriesInfo[];
  /** Cartesian/pie rows: `{ x: label, s0: number|null, … }`. */
  rows: Record<string, string | number | null>[];
  /** Scatter points per series. */
  points: { x: number; y: number }[][];
  /** Scorecard values. */
  cards: { label: string; value: number | null }[];
  /** Set when the data was cut to stay readable. */
  note: string | null;
}

interface Acc {
  nn: number;
  nums: number;
  sum: number;
  min: number;
  max: number;
  first: number | null;
  set: Set<unknown> | null;
}

const newAcc = (agg: Aggregation): Acc => ({
  nn: 0, nums: 0, sum: 0, min: Infinity, max: -Infinity, first: null, set: agg === "distinct" ? new Set() : null,
});

function add(acc: Acc, v: unknown) {
  if (v === null || v === undefined) return;
  acc.nn++;
  acc.set?.add(typeof v === "object" ? JSON.stringify(v) : v);
  const n = toNumber(v);
  if (n === null) return;
  acc.nums++;
  acc.sum += n;
  if (n < acc.min) acc.min = n;
  if (n > acc.max) acc.max = n;
  acc.first ??= n;
}

function finish(acc: Acc, agg: Aggregation): number | null {
  switch (agg) {
    case "none": return acc.first;
    case "sum": return acc.nums ? acc.sum : null;
    case "avg": return acc.nums ? acc.sum / acc.nums : null;
    case "count": return acc.nn;
    case "min": return acc.nums ? acc.min : null;
    case "max": return acc.nums ? acc.max : null;
    case "distinct": return acc.set?.size ?? 0;
  }
}

function dateParts(v: unknown): [number, number, number] | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : [v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()];
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Start-of-bucket ISO date plus a display label. */
function bucketDate(v: unknown, bucket: DateBucket): { key: string; label: string } | null {
  const parts = dateParts(v);
  if (!parts) return null;
  const [y, m, d] = parts;
  switch (bucket) {
    case "day": return { key: `${y}-${pad(m)}-${pad(d)}`, label: `${y}-${pad(m)}-${pad(d)}` };
    case "week": {
      const date = new Date(Date.UTC(y, m - 1, d));
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      const key = date.toISOString().slice(0, 10);
      return { key, label: key };
    }
    case "month": return { key: `${y}-${pad(m)}-01`, label: `${y}-${pad(m)}` };
    case "quarter": {
      const q = Math.floor((m - 1) / 3);
      return { key: `${y}-${pad(q * 3 + 1)}-01`, label: `${y} Q${q + 1}` };
    }
    case "year": return { key: `${y}-01-01`, label: String(y) };
    default: return null;
  }
}

type Sortable = number | string;
function compare(a: Sortable, b: Sortable): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

export function buildChartData(result: QueryResult, config: ChartConfig): ChartData {
  const empty: ChartData = { series: [], rows: [], points: [], cards: [], note: null };
  const defs = config.series.filter((s) => result.columns.includes(s.column));
  if (defs.length === 0) return empty;
  const shapes = columnShapes(result);
  const label = (s: (typeof defs)[number]) => (s.agg === "none" ? s.column : `${AGG_LABELS[s.agg].toLowerCase()} of ${s.column}`);

  if (config.type === "scorecard") {
    const accs = defs.map((s) => newAcc(s.agg));
    for (const row of result.rows) defs.forEach((s, i) => add(accs[i], row[s.column]));
    return { ...empty, cards: defs.map((s, i) => ({ label: label(s), value: finish(accs[i], s.agg) })) };
  }

  if (!result.columns.includes(config.xColumn)) return empty;
  const groupBy = config.groupBy && result.columns.includes(config.groupBy) && config.type !== "pie" ? config.groupBy : null;

  // Series definitions: one per Y definition, or one per (capped) group value.
  let seriesInfo: SeriesInfo[];
  let groupOf: ((row: Record<string, unknown>) => number) | null = null;
  let note: string | null = null;
  if (groupBy) {
    const first = defs[0];
    const weight = new Map<string, number>();
    for (const row of result.rows) {
      const g = row[groupBy] == null ? "(null)" : String(row[groupBy]);
      const n = first.agg === "count" || first.agg === "distinct" ? 1 : Math.abs(toNumber(row[first.column]) ?? 0);
      weight.set(g, (weight.get(g) ?? 0) + n);
    }
    const ranked = [...weight.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
    const capped = ranked.length > MAX_SERIES;
    const kept = capped ? ranked.slice(0, MAX_SERIES - 1) : ranked;
    const index = new Map(kept.map((g, i) => [g, i]));
    seriesInfo = kept.map((g, i) => ({ key: `s${i}`, label: g, color: SERIES_COLORS[i % SERIES_COLORS.length] }));
    if (capped) {
      seriesInfo.push({ key: `s${kept.length}`, label: OTHER, color: OTHER_COLOR });
      note = `${ranked.length - kept.length} smaller groups combined as “${OTHER}”`;
    }
    const otherIndex = kept.length;
    groupOf = (row) => index.get(row[groupBy] == null ? "(null)" : String(row[groupBy])) ?? otherIndex;
  } else {
    seriesInfo = defs.map((s, i) => ({ key: `s${i}`, label: label(s), color: SERIES_COLORS[i % SERIES_COLORS.length] }));
  }

  if (config.type === "scatter") {
    const y = defs[0].column;
    const points: { x: number; y: number }[][] = seriesInfo.map(() => []);
    let total = 0;
    for (const row of result.rows) {
      const px = toNumber(row[config.xColumn]);
      const py = toNumber(row[y]);
      if (px === null || py === null) continue;
      if (total >= MAX_POINTS) { note = `plotting the first ${MAX_POINTS.toLocaleString()} points`; break; }
      points[groupOf ? groupOf(row) : 0].push({ x: px, y: py });
      total++;
    }
    return { ...empty, series: groupBy ? seriesInfo : seriesInfo.slice(0, 1), points, note };
  }

  const isDate = shapes[config.xColumn] === "date";
  const bucketed = isDate && config.bucket !== "none";
  const groups = new Map<string, { label: string; sort: Sortable; cells: (Acc | undefined)[] }>();
  const aggs = groupBy ? seriesInfo.map(() => defs[0]) : defs;
  for (const row of result.rows) {
    const raw = row[config.xColumn];
    let key: string;
    let xLabel: string;
    let sort: Sortable;
    const b = bucketed ? bucketDate(raw, config.bucket) : null;
    if (b) {
      key = b.key;
      xLabel = b.label;
      sort = b.key;
    } else if (raw === null || raw === undefined) { key = xLabel = "(null)"; sort = ""; }
    else {
      xLabel = raw instanceof Date ? raw.toISOString() : typeof raw === "object" ? JSON.stringify(raw) : String(raw);
      key = xLabel;
      sort = toNumber(raw) ?? xLabel;
    }
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { label: xLabel, sort, cells: [] }));
    const si = groupOf ? groupOf(row) : -1;
    const targets = si >= 0 ? [si] : defs.map((_, i) => i);
    for (const i of targets) {
      const acc = (g.cells[i] ??= newAcc(aggs[i].agg));
      add(acc, row[aggs[i].column]);
    }
  }

  let list = [...groups.values()].map((g) => {
    const row: Record<string, string | number | null> = { x: g.label };
    seriesInfo.forEach((s, i) => (row[s.key] = g.cells[i] ? finish(g.cells[i]!, aggs[i].agg) : null));
    return { row, sort: g.sort };
  });
  const total = (r: Record<string, string | number | null>) => seriesInfo.reduce((t, s) => t + ((r[s.key] as number | null) ?? 0), 0);
  if (config.sort === "x-asc") list.sort((a, b) => compare(a.sort, b.sort));
  else if (config.sort === "x-desc") list.sort((a, b) => compare(b.sort, a.sort));
  else if (config.sort === "value-desc" || config.type === "pie") list.sort((a, b) => total(b.row) - total(a.row));

  if (config.type === "pie") {
    const slices = list.map((l) => l.row);
    if (slices.length > MAX_SERIES) {
      const rest = slices.slice(MAX_SERIES - 1);
      list = slices.slice(0, MAX_SERIES - 1).map((row) => ({ row, sort: "" }));
      list.push({ row: { x: OTHER, s0: rest.reduce((t, r) => t + ((r.s0 as number | null) ?? 0), 0) }, sort: "" });
      note = `${rest.length} smaller slices combined as “${OTHER}”`;
    }
  } else if (list.length > MAX_X_VALUES) {
    note = `showing the first ${MAX_X_VALUES.toLocaleString()} of ${list.length.toLocaleString()} X values`;
    list = list.slice(0, MAX_X_VALUES);
  }
  return { ...empty, series: config.type === "pie" ? seriesInfo.slice(0, 1) : seriesInfo, rows: list.map((l) => l.row), note };
}
