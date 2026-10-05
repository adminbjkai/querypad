import type { AiTurn, ColumnProfile, TableInfo, TableProfile, ViewInfo } from "../../types";
import type { Relationship, RelationshipVerdict } from "../../types/discovery";
import type { ChatTurn } from "./complete";

/**
 * Prompt material for the in-app AI assistant. Pure functions (no browser APIs) so the
 * context the model sees can be unit-tested.
 */

export const WORKSPACE_SQL_SYSTEM_PROMPT = `You write DuckDB SQL for QueryPad, a data workspace where the user's files are loaded as DuckDB tables.

Reply with SQL only — no prose and no markdown fences. If you must state an assumption, put it in a short "--" comment on the first line.

Rules:
- Use only the tables, views and columns listed in the context, spelled exactly as listed. Double-quote identifiers that are not plain lowercase snake_case.
- Join tables only on the joins listed under "Joins". Prefer accepted joins; never use rejected ones; never invent join keys. If tables the user wants combined have no listed join, say so in a "--" comment instead of guessing.
- The tables have no declared PRIMARY KEY or FOREIGN KEY constraints, so information_schema constraint views are empty. QueryPad's inferred keys are queryable instead: querypad.relationships (from_table, from_column, to_table, to_column, cardinality, confidence, status) and querypad.keys (table_name, column_name, key_type, references_table, references_column, status). Use these for questions about keys, primary/foreign keys or how tables relate; use information_schema.columns or DESCRIBE for column details.
- To show rows from many related tables at once, start from the table on the "many" side and LEFT JOIN each referenced table along the listed joins, aliasing every table and prefixing or renaming columns so names stay unique.
- If the user asks to create, change or delete data, write those statements (several statements separated by semicolons are fine). Otherwise write one read-only query.
- Use filter values that actually occur (see the column hints). Add ORDER BY when it makes the result easier to read.
- The conversation includes earlier requests and the SQL you wrote; when the user says "that", "it", "also" or refers to previous results, build on your previous SQL. The recent-query log shows what the user actually ran and whether it worked.`;

const MAX_COLUMNS_PER_TABLE = 80;
const MAX_SQL_CHARS = 600;
const MAX_LOG_ENTRIES = 12;
const MAX_VALUE_CHARS = 40;
/** Stay well under the server's 200k-character request cap (history and prompt ride along). */
const MAX_CONTEXT_CHARS = 120_000;
const MAX_THREAD_TURNS = 8;

export interface LogEntry {
  sql: string;
  rowCount: number | null;
  error: string | null;
}

export interface WorkspaceContextInput {
  tables: TableInfo[];
  views: ViewInfo[];
  profiles: Record<string, TableProfile | null | undefined>;
  relationships: Relationship[];
  verdicts: Record<string, RelationshipVerdict>;
  relationshipKey: (rel: Relationship) => string;
  log: LogEntry[];
  editorQuery: string;
  editorError: string | null;
}

function clip(text: string, max = MAX_SQL_CHARS): string {
  const flat = text.trim();
  return flat.length > max ? `${flat.slice(0, max)} …` : flat;
}

function format(value: string | number | null): string {
  if (value === null) return "null";
  return typeof value === "number" ? String(Math.round(value * 100) / 100) : value;
}

/** A short, factual hint about a column's values that helps the model filter correctly. */
export function columnHint(column: ColumnProfile, rowCount: number): string {
  const hints: string[] = [];
  if (column.distinctCount !== null && rowCount > 0 && column.distinctCount === rowCount && column.nullCount === 0) {
    hints.push("unique");
  }
  if (column.nullCount > 0) hints.push(`${column.nullPercent >= 10 ? column.nullPercent.toFixed(0) : column.nullPercent.toFixed(1)}% null`);
  if ((column.kind === "numeric" || column.kind === "date") && column.min !== null) {
    hints.push(`${format(column.min)} to ${format(column.max)}`);
  }
  const lowCardinality = column.distinctCount !== null && column.distinctCount <= 12;
  if (column.topValues.length > 0 && lowCardinality) {
    hints.push(`values: ${column.topValues.map((t) => clip(String(t.value), MAX_VALUE_CHARS)).join(", ")}`);
  } else if (column.topValues.length > 0 && column.kind === "text") {
    hints.push(`e.g. ${column.topValues.slice(0, 3).map((t) => clip(String(t.value), MAX_VALUE_CHARS)).join(", ")}`);
  }
  return hints.join("; ");
}

export function buildWorkspaceContext(input: WorkspaceContextInput): string {
  const full = renderContext(input, true);
  // Very wide workspaces: drop the per-column value hints before anything else.
  return full.length <= MAX_CONTEXT_CHARS ? full : clip(renderContext(input, false), MAX_CONTEXT_CHARS);
}

function renderContext(input: WorkspaceContextInput, withHints: boolean): string {
  const out: string[] = [];

  out.push("## Tables");
  if (input.tables.length === 0) out.push("(none loaded)");
  for (const table of input.tables) {
    out.push(`### ${table.name} (${table.rowCount === 0 ? "empty, 0 rows" : `${table.rowCount.toLocaleString("en-US")} rows`})`);
    const profile = input.profiles[table.name];
    const byName = new Map(profile?.columns.map((c) => [c.name, c]) ?? []);
    for (const column of table.columns.slice(0, MAX_COLUMNS_PER_TABLE)) {
      const columnProfile = byName.get(column.name);
      const hint = withHints && columnProfile ? columnHint(columnProfile, table.rowCount) : "";
      out.push(`- ${column.name} ${column.type}${hint ? ` — ${hint}` : ""}`);
    }
    if (table.columns.length > MAX_COLUMNS_PER_TABLE) {
      out.push(`- … ${table.columns.length - MAX_COLUMNS_PER_TABLE} more columns`);
    }
  }

  if (input.views.length > 0) {
    out.push("", "## Views");
    for (const view of input.views) {
      out.push(`### ${view.name}`, `- columns: ${view.columns.map((c) => `${c.name} ${c.type}`).join(", ")}`);
    }
  }

  out.push("", "## Joins (inferred by QueryPad from the data; also in querypad.relationships)");
  const usable = input.relationships
    .map((rel) => ({ rel, verdict: input.verdicts[input.relationshipKey(rel)] }))
    .filter(({ verdict }) => verdict !== "rejected")
    .sort((a, b) => Number(b.verdict === "accepted") - Number(a.verdict === "accepted") || b.rel.confidence - a.rel.confidence);
  if (usable.length === 0) out.push("(none found — do not invent joins)");
  for (const { rel, verdict } of usable) {
    out.push(
      `- ${rel.from.table}.${rel.from.column} -> ${rel.to.table}.${rel.to.column} (${rel.cardinality}, ${rel.confidence}% confidence, ${verdict === "accepted" ? "accepted by the user" : rel.evidence === "name" ? "inferred from the column name only, the table has no rows yet" : "inferred"})`
    );
  }
  const rejected = input.relationships.filter((rel) => input.verdicts[input.relationshipKey(rel)] === "rejected");
  if (rejected.length > 0) {
    out.push(`Rejected by the user (never join on these): ${rejected.map((r) => `${r.from.table}.${r.from.column} -> ${r.to.table}.${r.to.column}`).join("; ")}`);
  }

  if (input.log.length > 0) {
    out.push("", "## Recent queries the user ran (newest first)");
    input.log.slice(0, MAX_LOG_ENTRIES).forEach((entry, i) => {
      const status = entry.error ? `failed: ${clip(entry.error, 200)}` : `ok, ${entry.rowCount ?? 0} rows`;
      out.push(`${i + 1}. [${status}] ${clip(entry.sql).replace(/\s+/g, " ")}`);
    });
  }

  if (input.editorQuery.trim()) {
    out.push("", "## SQL currently in the editor", clip(input.editorQuery, 2000));
    if (input.editorError) out.push(`It failed with: ${clip(input.editorError, 400)}`);
  }

  return out.join("\n");
}

/** Earlier turns of this tab's conversation, as chat messages (oldest first). */
export function threadToHistory(thread: AiTurn[]): ChatTurn[] {
  return thread.slice(-MAX_THREAD_TURNS).flatMap((turn) => [
    { role: "user" as const, content: turn.prompt },
    {
      role: "assistant" as const,
      content: turn.check === "failed" && turn.checkError ? `${turn.sql}\n-- (this did not compile: ${turn.checkError})` : turn.sql,
    },
  ]);
}

/** The request body for one turn: the fresh workspace context plus the user's words. */
export function buildTurnInput(context: string, request: string): string {
  return `Workspace context (current state):\n${context}\n\nRequest: ${request}`;
}

/** Models occasionally wrap SQL in fences or add prose despite instructions; keep only SQL. */
export function cleanSql(text: string): string {
  const fenced = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}
