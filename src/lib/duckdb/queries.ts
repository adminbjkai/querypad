import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { exclusive, getConnection } from "./instance";
import { isReadOnlyStatement } from "./catalog-sql";
import { statementRanges } from "./sql-utils";
import type { QueryResult } from "@/types";
import { DataType, Decimal, type RecordBatch, type Schema, type Vector } from "apache-arrow";

/** Rows materialized into JS for display; the full count is still reported. */
export const MAX_RESULT_ROWS = 10_000;

function formatDateValue(val: unknown): string | unknown {
  if (val === null || val === undefined) return val;
  const num = typeof val === "bigint" ? Number(val) : val;
  if (typeof num !== "number") return val;
  return new Date(num).toISOString().split("T")[0];
}

function formatTimestampValue(val: unknown): string | unknown {
  if (val === null || val === undefined) return val;
  const num = typeof val === "bigint" ? Number(val) : val;
  if (typeof num !== "number") return val;
  return new Date(num).toISOString();
}

interface ColumnKind {
  date: boolean;
  timestamp: boolean;
  /** Decimal scale, or -1 for non-decimal columns. */
  scale: number;
}

/** One Arrow value as the results grid shows it: plain numbers, ISO dates and timestamps, scaled decimals. */
function convertValue(raw: unknown, kind: ColumnKind): unknown {
  let val = raw;
  // Extract primitive from Arrow wrapper objects
  if (val !== null && val !== undefined && typeof val === "object" && "valueOf" in val) {
    val = (val as { valueOf(): unknown }).valueOf();
  }
  if (typeof val === "bigint") {
    val = Number(val);
  }
  if (kind.date) return formatDateValue(val);
  if (kind.timestamp) return formatTimestampValue(val);
  if (kind.scale >= 0 && typeof val === "number") return val / Math.pow(10, kind.scale);
  return val;
}

/**
 * Collects a result arriving as Arrow record batches: the first `maxRows` rows become plain row
 * objects (read column by column), later batches are only counted, so `rowCount` stays exact
 * without keeping the whole result in memory.
 */
export class ResultCollector {
  readonly columns: string[];
  readonly columnTypes: string[];
  readonly rows: Record<string, unknown>[] = [];
  rowCount = 0;
  private readonly kinds: ColumnKind[];
  /** Rows are keyed by name, so a repeated column name reads the first column with that name. */
  private readonly sources: number[];

  constructor(schema: Schema, private readonly maxRows = MAX_RESULT_ROWS) {
    this.columns = schema.fields.map((f) => f.name);
    this.columnTypes = schema.fields.map((f) => String(f.type));
    this.kinds = schema.fields.map((f) => ({
      date: DataType.isDate(f.type),
      timestamp: DataType.isTimestamp(f.type),
      scale: DataType.isDecimal(f.type) ? (f.type as Decimal).scale : -1,
    }));
    this.sources = this.columns.map((name) => this.columns.indexOf(name));
  }

  add(batch: RecordBatch): void {
    const take = Math.min(batch.numRows, this.maxRows - this.rows.length);
    if (take > 0) {
      const { columns, kinds } = this;
      const vectors = this.sources.map((c) => batch.getChildAt(c) as Vector);
      for (let r = 0; r < take; r++) {
        const obj: Record<string, unknown> = {};
        for (let i = 0; i < columns.length; i++) obj[columns[i]] = convertValue(vectors[i].get(r), kinds[i]);
        this.rows.push(obj);
      }
    }
    this.rowCount += batch.numRows;
  }
}

/**
 * Split SQL text into its statements (trimmed, without the `;`), respecting string literals,
 * quoted identifiers, dollar quotes and comments (see `statementRanges`).
 */
export function splitStatements(sql: string): string[] {
  return statementRanges(sql)
    .map(([start, end]) => sql.slice(start, end).trim().replace(/;$/, "").trim())
    .filter((statement) => statement.length > 0);
}

export async function executeQuery(sql: string): Promise<QueryResult> {
  const conn = await getConnection();
  const statements = splitStatements(sql);

  if (statements.length === 0) {
    return { columns: [], columnTypes: [], rows: [], rowCount: 0, executionTimeMs: 0 };
  }

  const start = performance.now();

  // Execute all preceding statements (DDL, INSERT, etc.)
  for (let s = 0; s < statements.length - 1; s++) {
    try {
      await conn.query(statements[s]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Statement ${s + 1}: ${msg}`);
    }
  }

  let collected: ResultCollector;
  try {
    collected = await exclusive((raw) => collectResult(raw, statements[statements.length - 1]));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(statements.length > 1 ? `Statement ${statements.length}: ${msg}` : msg);
  }

  const executionTimeMs = Math.round(performance.now() - start);
  const { columns, columnTypes, rows, rowCount } = collected;
  return { columns, columnTypes, rows, rowCount, executionTimeMs };
}

/** DuckDB-Wasm's streamed batches carry no dictionaries, so ENUM values (dictionary-encoded) would read as null. */
function hasDictionary(type: DataType): boolean {
  return DataType.isDictionary(type) || (type.children ?? []).some((child) => hasDictionary(child.type));
}

/**
 * Run one statement and collect its result. Reads are streamed batch by batch, so a large result
 * is never copied out of the engine as a whole; writes (small results, must run exactly once) use a
 * plain `query`. A read whose result has ENUM columns is cancelled and read again with `query`
 * (streamed batches carry no dictionaries), so such a read runs twice.
 */
export async function collectResult(conn: AsyncDuckDBConnection, statement: string): Promise<ResultCollector> {
  if (isReadOnlyStatement(statement)) {
    const reader = await conn.send(statement);
    await reader.open();
    if (!reader.schema.fields.some((f) => hasDictionary(f.type))) {
      const collector = new ResultCollector(reader.schema);
      for await (const batch of reader) collector.add(batch);
      return collector;
    }
    await reader.cancel();
  }
  const table = await conn.query(statement);
  const collector = new ResultCollector(table.schema);
  for (const batch of table.batches) collector.add(batch);
  return collector;
}
