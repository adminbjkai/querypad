import type { QueryResult } from "@/types";
import { classifyType } from "@/lib/duckdb/sql-utils";

export type ChartType = "bar" | "hbar" | "line" | "area" | "scatter" | "pie" | "scorecard";
export type Aggregation = "none" | "sum" | "avg" | "count" | "min" | "max" | "distinct";
export type DateBucket = "none" | "day" | "week" | "month" | "quarter" | "year";
export type ChartSort = "none" | "x-asc" | "x-desc" | "value-desc";
export type ColumnShape = "number" | "date" | "string";

export interface ChartSeries {
  column: string;
  agg: Aggregation;
}

export interface ChartConfig {
  type: ChartType;
  xColumn: string;
  /** Only applied when the X column holds dates. */
  bucket: DateBucket;
  series: ChartSeries[];
  /** Splits the first series into one series per distinct value (capped, rest becomes "Other"). */
  groupBy: string | null;
  sort: ChartSort;
  stacked: boolean;
  legend: boolean;
  labels: boolean;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

function isDateValue(val: unknown): boolean {
  return val instanceof Date || (typeof val === "string" && DATE_PATTERN.test(val));
}

/** Classify every column as number/date/string, from its SQL type and, failing that, a sample of values. */
export function columnShapes(result: QueryResult): Record<string, ColumnShape> {
  const shapes: Record<string, ColumnShape> = {};
  result.columns.forEach((col, i) => {
    const kind = classifyType(result.columnTypes[i] ?? "");
    if (kind === "numeric") return void (shapes[col] = "number");
    if (kind === "date") return void (shapes[col] = "date");
    const values: unknown[] = [];
    for (const row of result.rows) {
      if (row[col] != null) values.push(row[col]);
      if (values.length >= 25) break;
    }
    if (values.length > 0 && values.every((v) => typeof v === "number" || typeof v === "bigint")) shapes[col] = "number";
    else if (values.length > 0 && kind !== "text" && values.every(isDateValue)) shapes[col] = "date";
    else shapes[col] = "string";
  });
  return shapes;
}

const base = { bucket: "none", groupBy: null, stacked: false, legend: true, labels: false } as const;

export function detectChartConfig(result: QueryResult): ChartConfig | null {
  if (result.rows.length === 0 || result.columns.length === 0) return null;

  const shapes = columnShapes(result);
  const columns = result.columns;
  const stringCols = columns.filter((c) => shapes[c] === "string");
  const numberCols = columns.filter((c) => shapes[c] === "number");
  const dateCols = columns.filter((c) => shapes[c] === "date");
  const sums = (cols: string[]): ChartSeries[] => cols.slice(0, 8).map((column) => ({ column, agg: "sum" }));

  // a single row of numbers is a KPI
  if (result.rows.length === 1 && numberCols.length >= 1) {
    return { ...base, type: "scorecard", xColumn: columns[0], series: sums(numberCols), sort: "none" };
  }

  // date + numbers → line over time
  if (dateCols.length >= 1 && numberCols.length >= 1) {
    // One measure by default (mixed scales hide each other); add more in Chart settings.
    return { ...base, type: "line", xColumn: dateCols[0], series: sums(numberCols.slice(0, 1)), sort: "x-asc" };
  }

  // string + numbers → pie for few categories, otherwise bar
  if (stringCols.length >= 1 && numberCols.length >= 1) {
    const categories = new Set(result.rows.map((r) => r[stringCols[0]])).size;
    const type: ChartType = numberCols.length === 1 && categories <= 10 ? "pie" : "bar";
    return { ...base, type, xColumn: stringCols[0], series: sums(numberCols.slice(0, 1)), sort: "none" };
  }

  // two+ numbers → scatter
  if (numberCols.length >= 2) {
    return {
      ...base,
      type: "scatter",
      xColumn: numberCols[0],
      series: [{ column: numberCols[1], agg: "none" }],
      sort: "none",
    };
  }

  // nothing numeric to plot: count rows per value of the first column
  return { ...base, type: "bar", xColumn: columns[0], series: [{ column: columns[0], agg: "count" }], sort: "value-desc" };
}
