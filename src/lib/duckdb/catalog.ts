import { getDB, getConnection } from "./instance";
import { dropAllSql, snapshotSelectSql } from "./catalog-sql";
import { quoteIdent } from "./sql-utils";
import type { ColumnInfo, TableInfo } from "@/types";

export interface CatalogView {
  name: string;
  /** The full `CREATE VIEW …;` statement, used to recreate it on restore. */
  sql: string;
}

/** `main` is the default schema, `current` follows the worksheet, `database` is every user schema. */
export type CatalogScope = "main" | "current" | "database";

function schemaPredicate(scope: CatalogScope): string {
  if (scope === "main") return "schema_name = 'main'";
  if (scope === "current") return "schema_name = current_schema()";
  return "schema_name NOT IN ('querypad', 'information_schema', 'pg_catalog', 'pg_toast')";
}

/** User-visible relations (temp tables and internals excluded). */
export async function readCatalog(scope: CatalogScope = "main"): Promise<{
  tables: string[];
  views: CatalogView[];
  schema: string;
  database: string;
}> {
  const conn = await getConnection();
  const where = `database_name = current_database() AND ${schemaPredicate(scope)} AND NOT temporary AND NOT internal`;
  const located = await conn.query("SELECT current_database() AS database, current_schema() AS schema");
  const here = located.toArray()[0] as Record<string, unknown> | undefined;
  const tables = await conn.query(`SELECT table_name FROM duckdb_tables() WHERE ${where} ORDER BY table_name`);
  const views = await conn.query(`SELECT view_name, sql FROM duckdb_views() WHERE ${where} ORDER BY view_name`);
  return {
    tables: tables.toArray().map((r: Record<string, unknown>) => String(r.table_name)),
    views: views.toArray().map((r: Record<string, unknown>) => ({ name: String(r.view_name), sql: String(r.sql) })),
    schema: String(here?.schema ?? "main"),
    database: String(here?.database ?? "memory"),
  };
}

/** Every user table and view name in the current database, across schemas. */
export async function listUserRelationNames(): Promise<{ tables: Set<string>; views: Set<string> }> {
  const conn = await getConnection();
  const where = `database_name = current_database() AND ${schemaPredicate("database")} AND NOT temporary AND NOT internal`;
  const tables = await conn.query(`SELECT table_name AS name FROM duckdb_tables() WHERE ${where}`);
  const views = await conn.query(`SELECT view_name AS name FROM duckdb_views() WHERE ${where}`);
  return {
    tables: new Set(tables.toArray().map((r: Record<string, unknown>) => String(r.name))),
    views: new Set(views.toArray().map((r: Record<string, unknown>) => String(r.name))),
  };
}

/**
 * One pass over the catalog: every relation in the current schema, column signature ("name:TYPE|…",
 * the same shape `describeRelation` produces) plus DuckDB's row estimate for tables, so a
 * sync can tell which relations need a full DESCRIBE + COUNT(*) instead of doing it for all.
 */
export const CATALOG_SIGNATURE_SQL = `SELECT c.table_name AS name,
       string_agg(c.column_name || ':' || c.data_type, '|' ORDER BY c.column_index) AS signature,
       any_value(t.estimated_size) AS estimated_rows
     FROM duckdb_columns() c
     LEFT JOIN duckdb_tables() t
       ON t.database_name = c.database_name AND t.schema_name = c.schema_name AND t.table_name = c.table_name
     WHERE c.database_name = current_database() AND c.schema_name = current_schema() AND NOT c.internal
     GROUP BY c.table_name`;

export interface RelationSignature {
  signature: string;
  /** DuckDB's estimate (exact for fresh tables; may lag deletes); null for views. */
  estimatedRows: number | null;
}

export async function readCatalogSignatures(): Promise<Map<string, RelationSignature>> {
  const conn = await getConnection();
  const rows = await conn.query(CATALOG_SIGNATURE_SQL);
  return new Map(
    rows.toArray().map((r: Record<string, unknown>) => [
      String(r.name),
      {
        signature: String(r.signature ?? ""),
        estimatedRows: r.estimated_rows === null || r.estimated_rows === undefined ? null : Number(r.estimated_rows),
      },
    ])
  );
}

/** Column list and row count for a table or view. */
export async function describeRelation(name: string, countRows = true, schema?: string): Promise<TableInfo> {
  const conn = await getConnection();
  const relation = schema ? `${quoteIdent(schema)}.${quoteIdent(name)}` : quoteIdent(name);
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
export async function snapshotTable(name: string, columns: ColumnInfo[], schema = "main"): Promise<Uint8Array> {
  const db = await getDB();
  const conn = await getConnection();
  const path = `/qp-snapshot-${crypto.randomUUID()}.parquet`;
  await conn.query(`COPY (${snapshotSelectSql(name, columns, schema)}) TO '${path}' (FORMAT PARQUET)`);
  try {
    return new Uint8Array(await db.copyFileToBuffer(path));
  } finally {
    await db.dropFile(path).catch(() => undefined);
  }
}

/** Remove every user table and view (used when clearing or switching spaces). */
export async function resetDatabase(): Promise<void> {
  const conn = await getConnection();
  // `main` is an internal schema, so this drops user-created schemas (and querypad) only.
  const extra = await conn.query(
    `SELECT schema_name FROM duckdb_schemas()
     WHERE database_name = current_database() AND NOT internal
       AND schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')`
  );
  for (const row of extra.toArray() as Record<string, unknown>[]) {
    const schema = String(row.schema_name);
    await conn.query(`DROP SCHEMA IF EXISTS ${quoteIdent(schema)} CASCADE`).catch((err) =>
      console.error("Reset failed:", schema, err)
    );
  }
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
