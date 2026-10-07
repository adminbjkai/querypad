export interface ColumnInfo {
  name: string;
  type: string;
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  rowCount: number;
}

export type ProfileColumnKind = "numeric" | "date" | "text" | "boolean" | "other";

export interface ProfileTopValue {
  value: string;
  count: number;
}

export interface ColumnProfile {
  name: string;
  type: string;
  kind: ProfileColumnKind;
  nullCount: number;
  nullPercent: number;
  distinctCount: number | null;
  min: string | number | null;
  max: string | number | null;
  avg: number | null;
  topValues: ProfileTopValue[];
}

export interface TableProfile {
  tableName: string;
  rowCount: number;
  columnCount: number;
  generatedAt: number;
  columns: ColumnProfile[];
}

export interface TableProfileState {
  status: "idle" | "loading" | "ready" | "error";
  profile: TableProfile | null;
  error: string | null;
}

export interface QueryResult {
  columns: string[];
  columnTypes: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
}

export interface QueryError {
  message: string;
}

export interface SharePayload {
  q: string;
  d: Record<string, string>;
  t: { name: string; fileName: string }[];
}

/** One exchange with the AI assistant, kept per tab so follow-ups have context. */
export interface AiTurn {
  id: string;
  prompt: string;
  /** The SQL the assistant produced (after any automatic repair). */
  sql: string;
  at: number;
  /** Result of compiling the SQL against the current tables before showing it. */
  check: "ok" | "failed" | "skipped";
  checkError?: string;
}

/** A view created with SQL; restored from its CREATE statement. */
export interface ViewInfo extends TableInfo {
  sql: string;
}

export interface EditorTab {
  id: string;
  title: string;
  query: string;
  result: QueryResult | null;
  error: QueryError | null;
  isExecuting: boolean;
  /** The SQL that produced `result`/`error` (may be a selection, or since-edited text). */
  lastRunSql?: string;
  /** Conversation with the AI assistant in this tab. */
  aiThread?: AiTurn[];
  /** The library query this tab is bound to (saved with the tab); null/absent when unsaved. */
  savedQueryId?: string | null;
  createdAt: number;
}

export type { Folder, SavedQuery, Notebook, NotebookCell, NotebookCellKind } from "./library";
