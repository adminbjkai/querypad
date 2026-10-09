import { flushWorkspaceSave, useWorkspaceStore, type HistoryEntry } from "@/stores/workspace-store";
import { newCell } from "../notebook/cells";
import { nextNotebookName, type CatalogSnapshot, type NotebookDraft, type StepResult } from "./plan";

/**
 * Runs one Agent step through the same engine path as the workbench: `executeQuery`, then —
 * for anything that isn't a read — the store's `syncCatalog` with the statement's targets, so
 * new or changed tables show up in the Tables panel, Home and the saved space exactly as if
 * the user had run the SQL in a tab. Each run is also recorded in the space's History.
 */

const RESULT_ROWS_KEPT = 50;
const MAX_HISTORY = 100;

/** History entries written by the Agent carry `source: "agent"` so the History panel can mark them. */
function record(sql: string, entry: Omit<HistoryEntry, "id" | "sql" | "at" | "source">) {
  const full: HistoryEntry = { id: crypto.randomUUID(), sql, at: Date.now(), source: "agent", ...entry };
  useWorkspaceStore.setState((state) => ({
    history: [full, ...state.history.filter((h) => h.sql !== sql)].slice(0, MAX_HISTORY),
  }));
}

export async function runStep(sql: string): Promise<StepResult> {
  const [{ executeQuery, splitStatements }, { isReadOnlyStatement, mutationTargets }] = await Promise.all([
    import("@/lib/duckdb/queries"),
    import("@/lib/duckdb/catalog-sql"),
  ]);
  const statements = splitStatements(sql);
  const write = statements.some((s) => !isReadOnlyStatement(s));
  const started = performance.now();
  let result;
  try {
    result = await executeQuery(sql);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    record(sql, { rowCount: null, ms: Math.round(performance.now() - started), error: message });
    if (write) await useWorkspaceStore.getState().syncCatalog(mutationTargets(statements)).catch((e) => console.error("Catalog sync failed:", e));
    throw new Error(message);
  }
  record(sql, { rowCount: result.rowCount, ms: result.executionTimeMs, error: null });
  if (write) {
    await useWorkspaceStore.getState().syncCatalog(mutationTargets(statements)).catch((e) => console.error("Catalog sync failed:", e));
  }
  // INSERT/UPDATE/DELETE come back as one "Count" row: that's the affected-rows figure.
  const affected =
    write && result.columns.length === 1 && /^count$/i.test(result.columns[0]) && result.rows.length === 1 ? Number(result.rows[0][result.columns[0]]) : undefined;
  return {
    columns: result.columns,
    columnTypes: result.columnTypes,
    rows: result.rows.slice(0, RESULT_ROWS_KEPT),
    rowCount: result.rowCount,
    ms: result.executionTimeMs,
    ...(affected !== undefined && Number.isFinite(affected) ? { affected } : {}),
  };
}

/**
 * Create a notebook in the open space from an agent step and return a one-row result.
 * Does not run the cells — the notebook is there for the user to run, top to bottom.
 */
function whenHydrated(): Promise<void> {
  // Node tests have no space load to wait for. In the app, creating during load is overwritten.
  if (useWorkspaceStore.getState()._hydrated || typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useWorkspaceStore.subscribe((state) => {
      if (!state._hydrated) return;
      unsub();
      resolve();
    });
  });
}

export async function runNotebookStep(draft: NotebookDraft): Promise<StepResult> {
  const started = performance.now();
  // A notebook created before the space finishes loading is replaced by the loaded record.
  await whenHydrated();
  const ws = useWorkspaceStore.getState();
  const name = nextNotebookName(draft.name, ws.notebooks.map((n) => n.name));
  const notebook = ws.createNotebook(name);
  useWorkspaceStore.getState().updateNotebookCells(
    notebook.id,
    draft.cells.map((cell) => newCell(cell.kind, cell.source))
  );
  // The space save is debounced. Flush it so a sync poll cannot reload the space without this notebook.
  await flushWorkspaceSave();
  const sql = draft.cells.filter((c) => c.kind === "sql").length;
  const text = draft.cells.length - sql;
  return {
    columns: ["notebook", "cells"],
    columnTypes: ["VARCHAR", "VARCHAR"],
    rows: [{ notebook: name, cells: `${sql} SQL, ${text} text` }],
    rowCount: 1,
    ms: Math.round(performance.now() - started),
    notebookId: notebook.id,
  };
}

/** Tables (with row counts) and views as the store knows them now. */
export function catalogSnapshot(): CatalogSnapshot {
  const ws = useWorkspaceStore.getState();
  return { tables: ws.tables.map((t) => ({ name: t.name, rowCount: t.rowCount })), views: ws.views.map((v) => v.name) };
}
