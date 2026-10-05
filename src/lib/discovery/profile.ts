import type {
  ColumnInfo,
  ColumnProfile,
  ProfileColumnKind,
  ProfileTopValue,
  TableInfo,
  TableProfile,
} from "../../types";
import { classifyType, quoteIdent } from "../duckdb/sql-utils";
import type { QueryRunner } from "./relationships";

/**
 * Normalize a raw engine value into a plain JS value. Handles `bigint` (Node + Arrow
 * integers), `Date`, and wrapper objects whose `valueOf()` yields a different value
 * (Arrow decimals and similar). Objects without a meaningful `valueOf` (e.g.
 * `@duckdb/node-api` DATE/TIMESTAMP/DECIMAL values) are returned unchanged.
 */
export function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "valueOf" in value) {
    const unwrapped = (value as { valueOf(): unknown }).valueOf();
    if (unwrapped !== value) return normalizeValue(unwrapped);
  }
  return value;
}

function toNumber(value: unknown): number | null {
  const normalized = normalizeValue(value);
  if (typeof normalized === "number") return Number.isFinite(normalized) ? normalized : null;
  if (typeof normalized === "string" && normalized.trim() !== "") {
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toScalar(value: unknown): string | number | null {
  const normalized = normalizeValue(value);
  if (normalized === null || normalized === undefined) return null;
  if (typeof normalized === "number") {
    return Number.isFinite(normalized) ? normalized : String(normalized);
  }
  if (typeof normalized === "string") return normalized;
  return String(normalized);
}

interface ColumnStats {
  nullCount: number;
  distinctCount: number | null;
  min: string | number | null;
  max: string | number | null;
  avg: number | null;
}

const EMPTY_STATS: ColumnStats = { nullCount: 0, distinctCount: null, min: null, max: null, avg: null };

function hasMinMax(kind: ProfileColumnKind): boolean {
  return kind === "numeric" || kind === "date";
}

function hasTopValues(kind: ProfileColumnKind): boolean {
  return kind === "text" || kind === "boolean" || kind === "other";
}

/** Aggregate expressions for one column, aliased by position (`c<i>_*`) to avoid clashes. */
function statsSelectList(column: ColumnInfo, index: number): string[] {
  const col = quoteIdent(column.name);
  const kind = classifyType(column.type);
  const exprs = [
    `COUNT(*) - COUNT(${col}) AS c${index}_nulls`,
    `COUNT(DISTINCT ${col}) AS c${index}_distinct`,
  ];
  if (kind === "date") {
    // Cast in SQL so every engine reports the same readable text (DuckDB-Wasm would
    // otherwise hand back epoch milliseconds for DATE/TIMESTAMP).
    exprs.push(
      `CAST(MIN(${col}) AS VARCHAR) AS c${index}_min`,
      `CAST(MAX(${col}) AS VARCHAR) AS c${index}_max`
    );
  } else if (hasMinMax(kind)) {
    exprs.push(`MIN(${col}) AS c${index}_min`, `MAX(${col}) AS c${index}_max`);
  }
  if (kind === "numeric") {
    exprs.push(`AVG(${col}) AS c${index}_avg`);
  }
  return exprs;
}

function readStats(row: Record<string, unknown> | undefined, index: number): ColumnStats {
  return {
    nullCount: toNumber(row?.[`c${index}_nulls`]) ?? 0,
    distinctCount: toNumber(row?.[`c${index}_distinct`]),
    min: toScalar(row?.[`c${index}_min`]),
    max: toScalar(row?.[`c${index}_max`]),
    avg: toNumber(row?.[`c${index}_avg`]),
  };
}

/** One scan: null/distinct counts plus MIN/MAX/AVG for every column of the table. */
async function readAllStats(
  runner: QueryRunner,
  table: TableInfo
): Promise<ColumnStats[]> {
  const selectList = table.columns.flatMap((column, index) => statsSelectList(column, index));
  const rows = await runner(`SELECT ${selectList.join(", ")} FROM ${quoteIdent(table.name)}`);
  return table.columns.map((_, index) => readStats(rows[0], index));
}

/** Fallback when the batched query fails: per-column queries, each isolated. */
async function readColumnStats(
  runner: QueryRunner,
  tableName: string,
  column: ColumnInfo
): Promise<ColumnStats> {
  const table = quoteIdent(tableName);
  const col = quoteIdent(column.name);
  const kind = classifyType(column.type);
  const stats: ColumnStats = { ...EMPTY_STATS };

  try {
    const rows = await runner(
      `SELECT COUNT(*) - COUNT(${col}) AS c0_nulls, COUNT(DISTINCT ${col}) AS c0_distinct FROM ${table}`
    );
    const base = readStats(rows[0], 0);
    stats.nullCount = base.nullCount;
    stats.distinctCount = base.distinctCount;
  } catch (err) {
    console.error(`Failed to profile ${tableName}.${column.name}:`, err);
  }

  if (hasMinMax(kind)) {
    try {
      const exprs = statsSelectList(column, 0).slice(2);
      const rows = await runner(`SELECT ${exprs.join(", ")} FROM ${table}`);
      const range = readStats(rows[0], 0);
      stats.min = range.min;
      stats.max = range.max;
      stats.avg = range.avg;
    } catch (err) {
      console.error(`Failed to read min/max for ${tableName}.${column.name}:`, err);
    }
  }

  return stats;
}

async function readTopValues(
  runner: QueryRunner,
  tableName: string,
  columnName: string
): Promise<ProfileTopValue[]> {
  const table = quoteIdent(tableName);
  const column = quoteIdent(columnName);
  const rows = await runner(`
    SELECT CAST(${column} AS VARCHAR) AS value, COUNT(*) AS value_count
    FROM ${table}
    WHERE ${column} IS NOT NULL
    GROUP BY 1
    ORDER BY value_count DESC, value ASC
    LIMIT 5
  `);
  return rows.map((row) => ({
    value: String(toScalar(row.value) ?? ""),
    count: toNumber(row.value_count) ?? 0,
  }));
}

/**
 * Profile a loaded table through any engine's `QueryRunner` (DuckDB-Wasm in the browser,
 * `@duckdb/node-api` in the CLI). Column stats come from a single aggregate scan; top
 * values are one GROUP BY per text/boolean/other column.
 */
export async function profileTableWith(
  runner: QueryRunner,
  table: TableInfo,
  now: number = Date.now()
): Promise<TableProfile> {
  let stats: ColumnStats[] = [];
  if (table.columns.length > 0) {
    try {
      stats = await readAllStats(runner, table);
    } catch {
      stats = [];
      for (const column of table.columns) {
        stats.push(await readColumnStats(runner, table.name, column));
      }
    }
  }

  const columns: ColumnProfile[] = [];
  for (const [index, column] of table.columns.entries()) {
    const kind = classifyType(column.type);
    const { nullCount, distinctCount, min, max, avg } = stats[index];

    let topValues: ProfileTopValue[] = [];
    if (hasTopValues(kind)) {
      try {
        topValues = await readTopValues(runner, table.name, column.name);
      } catch (err) {
        console.error(`Failed to read top values for ${table.name}.${column.name}:`, err);
      }
    }

    columns.push({
      name: column.name,
      type: column.type,
      kind,
      nullCount,
      nullPercent: table.rowCount === 0 ? 0 : (nullCount / table.rowCount) * 100,
      distinctCount,
      min,
      max,
      avg,
      topValues,
    });
  }

  return {
    tableName: table.name,
    rowCount: table.rowCount,
    columnCount: table.columns.length,
    generatedAt: now,
    columns,
  };
}
