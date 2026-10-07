import { useWorkspaceStore } from "@/stores/workspace-store";
import type { QueryResult } from "@/types";

/**
 * Run one notebook cell's SQL on the shared DuckDB connection, without touching any SQL tab.
 * Mirrors `workspace-store.runQuery`: after a non-read-only statement (even one that failed
 * part-way) the catalog is reconciled for the tables the statement named.
 */
export async function runCellSql(sql: string): Promise<QueryResult> {
  const text = sql.trim();
  const [{ executeQuery, splitStatements }, { isReadOnlyStatement, mutationTargets }] = await Promise.all([
    import("@/lib/duckdb/queries"),
    import("@/lib/duckdb/catalog-sql"),
  ]);
  const statements = splitStatements(text);
  try {
    return await executeQuery(text);
  } finally {
    if (statements.some((s) => !isReadOnlyStatement(s))) {
      try {
        await useWorkspaceStore.getState().syncCatalog(mutationTargets(statements));
      } catch (err) {
        console.error("Catalog sync failed:", err);
      }
    }
  }
}
