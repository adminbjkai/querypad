import { getDB, getConnection } from "./instance";
import { dropAllSql, snapshotSelectSql } from "./catalog-sql";
import { quoteIdent } from "./sql-utils";
import type { ColumnInfo, TableInfo } from "@/types";

export interface CatalogView {
  name: string;
  /** The full `CREATE VIEW …;` statement, used to recreate it on restore. */
  sql: string;
}

/** User-visible relations in the main schema (temp tables and internals excluded). */
export async function readCatalog(): Promise<{ tables: string[]; views: CatalogView[] }> {
  const conn = await getConnection();
  const tables = await conn.query(
    `SELECT table_name FROM duckdb_tables()
     WHERE database_name = current_database() AND schema_name = 'main' AND NOT temporary AND NOT internal
     ORDER BY table_name`
  );
  const views = await conn.query(
    `SELECT view_name, sql FROM duckdb_views()
     WHERE database_name = current_database() AND schema_name = 'main' AND NOT temporary AND NOT internal
     ORDER BY view_name`
  );
  return {
    tables: tables.toArray().map((r: Record<string, unknown>) => String(r.table_name)),
    views: views.toArray().map((r: Record<string, unknown>) => ({ name: String(r.view_name), sql: String(r.sql) })),
  };
}

/** Column list and row count for a table or view. */
export async function describeRelation(name: string, countRows = true): Promise<TableInfo> {
  const conn = await getConnection();
  const relation = quoteIdent(name);
  const described = await conn.query(`DESCRIBE ${relation}`);
  const columns: ColumnInfo[] = described.toArray().map((row: Record<string, unknown>) => ({
    name: String(row.column_name),
    type: String(row.column_type),
  }));
  let rowCount = 0;
  if (countRows) {
    const counted = await conn.query(`SELECT COUNT(*) AS cnt FROM ${relation}`);
    rowCount = Number(counted.toArray()[0]?.cnt ?? 0);
  }
  return { name, columns, rowCount };
}

/** Serialize a table to Parquet bytes so SQL-created tables persist, share and sync like files. */
export async function snapshotTable(name: string, columns: ColumnInfo[]): Promise<Uint8Array> {
  const db = await getDB();
  const conn = await getConnection();
  const path = `/qp-snapshot-${crypto.randomUUID()}.parquet`;
  await conn.query(`COPY (${snapshotSelectSql(name, columns)}) TO '${path}' (FORMAT PARQUET)`);
  try {
    return new Uint8Array(await db.copyFileToBuffer(path));
  } finally {
    await db.dropFile(path).catch(() => undefined);
  }
}

/** Remove every user table and view (used when clearing or switching spaces). */
export async function resetDatabase(): Promise<void> {
  const conn = await getConnection();
  const { tables, views } = await readCatalog();
  for (const statement of dropAllSql(tables, views.map((v) => v.name))) {
    await conn.query(statement).catch((err) => console.error("Reset failed:", statement, err));
  }
}

/** Recreate saved views; retries so views that depend on other views still come back. */
export async function restoreViews(views: CatalogView[]): Promise<CatalogView[]> {
  const conn = await getConnection();
  let pending = [...views];
  for (let pass = 0; pass < views.length && pending.length > 0; pass++) {
    const next: CatalogView[] = [];
    for (const view of pending) {
      try {
        await conn.query(view.sql);
      } catch {
        next.push(view);
      }
    }
    if (next.length === pending.length) break;
    pending = next;
  }
  return pending; // views that could not be recreated
}
