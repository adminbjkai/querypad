import type { QueryResult } from "../../types";
import { buildWorkspaceContext, type WorkspaceContextInput } from "./workspace-context";

/**
 * The side Assistant: a chat that answers questions about the whole workspace. It can look
 * at data on its own (read-only queries the app runs automatically, see autoRunRejection) but
 * never changes anything — it only replies in the chat. Pure functions so prompts and parsing
 * can be unit-tested.
 */

export const ASSISTANT_SYSTEM_PROMPT = `You are the QueryPad Assistant, a chat panel inside QueryPad — a local-first data workspace where the user's files are DuckDB tables. Each message comes with the live workspace state: tables, columns with value hints, inferred joins, open tabs and their SQL, the current result, recent runs and errors, saved snippets and spaces. Answer the user's questions about their data, their queries and the app.

Answer in concise Markdown. Lead with the answer, then the detail that supports it; no filler. Use real table and column names exactly as spelled. Use small Markdown tables for figures.

You only reply in the chat — you can't click, edit the query or change the workspace. When SQL would help, show it in a \`\`\`sql block the user can copy. Only join on the listed joins; QueryPad's inferred keys are queryable as querypad.relationships and querypad.keys.

Looking at data yourself: when the answer needs actual values you don't have, put ONE plain read-only DuckDB query (SELECT, WITH … SELECT, DESCRIBE, SUMMARIZE) over the loaded tables in a fenced block with the language \`sql-run\` and stop writing. QueryPad runs it and sends you the result; then finish your answer from it. Keep these small (aggregate, or LIMIT 50). Don't use sql-run for anything else.`;

export interface AssistantTab {
  title: string;
  query: string;
  active: boolean;
  error: string | null;
}

export interface AssistantContextInput extends WorkspaceContextInput {
  tabs: AssistantTab[];
  result: QueryResult | null;
  snippets: { name: string; folder?: string; description?: string }[];
  spaces: { name: string; tableCount: number; current: boolean }[];
  viewMode: string;
}

const MAX_RESULT_ROWS = 20;
const MAX_CELL = 60;

function cell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.length > MAX_CELL ? `${text.slice(0, MAX_CELL)}…` : text;
}

/** A compact pipe table of the first rows of a result. */
export function resultPreview(result: QueryResult, maxRows = MAX_RESULT_ROWS): string {
  const header = result.columns.join(" | ");
  const rows = result.rows.slice(0, maxRows).map((row) => result.columns.map((c) => cell(row[c])).join(" | "));
  const more = result.rowCount > maxRows ? `\n… ${result.rowCount - maxRows} more rows` : "";
  return `${header}\n${rows.join("\n")}${more}`;
}

export function buildAssistantContext(input: AssistantContextInput): string {
  const out = [buildWorkspaceContext(input)];

  out.push("", "## Open tabs");
  for (const tab of input.tabs) {
    const sql = tab.query.trim().replace(/\s+/g, " ");
    out.push(`- ${tab.active ? "(active) " : ""}${tab.title}: ${sql ? sql.slice(0, 200) : "(empty)"}${tab.error ? ` — last run failed: ${tab.error.slice(0, 160)}` : ""}`);
  }

  if (input.result) {
    const r = input.result;
    out.push(
      "",
      `## Result in the active tab (${r.rowCount.toLocaleString("en-US")} rows, ${r.executionTimeMs} ms)`,
      `Columns: ${r.columns.map((c, i) => `${c} ${r.columnTypes[i] ?? ""}`.trim()).join(", ")}`,
      resultPreview(r)
    );
  }

  if (input.snippets.length > 0) {
    out.push("", "## Saved snippets");
    for (const s of input.snippets.slice(0, 40)) {
      out.push(`- ${s.folder ? `${s.folder} / ` : ""}${s.name}${s.description ? ` — ${s.description}` : ""}`);
    }
  }

  out.push("", "## Spaces");
  for (const sp of input.spaces) out.push(`- ${sp.current ? "(open) " : ""}${sp.name} (${sp.tableCount} tables)`);
  out.push("", `Mode: ${input.viewMode}`);
  return out.join("\n");
}

/** The user's message with the live workspace state attached. */
export function assistantTurnInput(context: string, message: string): string {
  return `Workspace state right now:\n${context}\n\nUser: ${message}`;
}

/** The query the assistant asked QueryPad to run (first sql-run block), if any. */
export function extractRunRequest(reply: string): string | null {
  const match = reply.match(/```sql-run\s*\n([\s\S]*?)```/i);
  return match ? match[1].trim() || null : null;
}

/** What the model gets back after a sql-run request. */
export function runResultMessage(sql: string, result: QueryResult | null, error: string | null): string {
  if (error) return `QueryPad ran your sql-run query and it failed:\n${error}\nFix it or answer without it.`;
  if (!result) return "QueryPad did not run the query.";
  return `QueryPad ran your sql-run query (${result.rowCount} rows, ${result.executionTimeMs} ms):\n${resultPreview(result, 50)}\nContinue your answer for the user.`;
}

// --- What the assistant may run without asking --------------------------------------

const AUTO_FIRST_WORDS = new Set(["select", "with", "from", "values", "table", "describe", "show", "summarize"]);
/** Any of these anywhere (outside string literals) means the query isn't a pure read. */
const AUTO_DENY =
  /\b(insert|update|delete|merge|upsert|copy|attach|detach|create|drop|alter|truncate|set|reset|pragma|call|install|load|export|import|checkpoint|vacuum|analyze|begin|commit|rollback|use|grant|revoke)\b/i;
/** Table functions that read files or URLs, or run SQL given as a string. */
const AUTO_DENY_FUNCTIONS = /\b(read_\w+|\w+_scan|glob|sniff_csv|query|query_table|parquet_metadata|parquet_schema)\s*\(/i;

/** Replace comments and string literals with spaces so keyword checks see only SQL. */
function stripLiterals(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""');
}

/**
 * Whether a statement the assistant asked for may run automatically (no click). Stricter than
 * "read-only": one plain query over tables already loaded — no writes, no settings, no file or
 * URL access (which could leak data through the request), no EXPLAIN ANALYZE. Returns the
 * reason it can't, or null when it's fine. The caller also checks it's a single statement.
 */
export function autoRunRejection(statement: string): string | null {
  if (/:\/\//.test(statement)) return "it reaches outside the workspace (a URL)";
  const code = stripLiterals(statement);
  const first = code.trim().match(/^[(\s]*([a-z_]+)/i)?.[1]?.toLowerCase() ?? "";
  if (!AUTO_FIRST_WORDS.has(first)) return "it isn't a plain query";
  if (AUTO_DENY.test(code)) return "it could change data or settings";
  if (AUTO_DENY_FUNCTIONS.test(code)) return "it reads files or runs SQL from a string";
  return null;
}
