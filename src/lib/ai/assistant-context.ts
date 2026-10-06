import type { QueryResult } from "../../types";
import { buildWorkspaceContext, type WorkspaceContextInput } from "./workspace-context";

/**
 * The side Assistant: a chat that sees the whole workspace and can look at data on its own
 * (read-only queries the app runs automatically) and propose app actions the user applies
 * with one click. Pure functions so prompts and parsing can be unit-tested.
 */

export const ASSISTANT_SYSTEM_PROMPT = `You are the QueryPad Assistant, built into QueryPad — a local-first data workspace where the user's files are DuckDB tables. You see the live workspace state (tables, columns with value hints, inferred joins, open tabs, the current result, recent runs, saved snippets, spaces) in the context of each message. Help the user understand their data, answer questions, explain and fix SQL, and drive the app.

Answer in concise Markdown. Lead with the answer; avoid filler. Use real names from the context, exactly as spelled.

Looking at data yourself: when a question needs actual values, put ONE read-only DuckDB query (SELECT, WITH … SELECT, DESCRIBE, SUMMARIZE, SHOW) in a fenced block with the language \`sql-run\` and stop writing. QueryPad runs it immediately and sends you the result; then continue. Keep these queries small (aggregate or LIMIT 50). Never put writes in sql-run.

SQL for the user: put it in a \`\`\`sql block. The user can run, insert or save it. Only join on the listed joins; QueryPad's inferred keys are queryable as querypad.relationships and querypad.keys.

App actions: to do something in the app, add a fenced block with the language \`action\` holding one JSON object. The user applies it with one click. Available:
{"type":"run_in_tab","title":"…","sql":"…"}      open SQL in a new tab and run it
{"type":"open_tab","title":"…","sql":"…"}        open SQL in a new tab
{"type":"replace_query","sql":"…"}              replace the SQL in the current tab
{"type":"save_snippet","name":"…","sql":"…","folder":"…"}
{"type":"preview_table","table":"…"}
{"type":"profile_table","table":"…"}
{"type":"show_panel","panel":"tables|joins|history|snippets"}
{"type":"discover_joins"}
{"type":"set_join","from":"table.column","to":"table.column","verdict":"accepted|rejected"}
{"type":"switch_space","name":"…"}
Offer an action when it saves the user a step; don't describe clicks the user could avoid.`;

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

export type AssistantAction =
  | { type: "run_in_tab" | "open_tab"; title?: string; sql: string }
  | { type: "replace_query"; sql: string }
  | { type: "save_snippet"; name: string; sql: string; folder?: string }
  | { type: "preview_table" | "profile_table"; table: string }
  | { type: "show_panel"; panel: "tables" | "joins" | "history" | "snippets" }
  | { type: "discover_joins" }
  | { type: "set_join"; from: string; to: string; verdict: "accepted" | "rejected" }
  | { type: "switch_space"; name: string };

/** Validate one action block's JSON; null if it isn't a known, well-formed action. */
export function parseAction(json: string): AssistantAction | null {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const a = value as Record<string, unknown>;
  const str = (k: string) => typeof a[k] === "string" && (a[k] as string).trim().length > 0;
  switch (a.type) {
    case "run_in_tab":
    case "open_tab":
    case "replace_query":
      return str("sql") ? (a as AssistantAction) : null;
    case "save_snippet":
      return str("name") && str("sql") ? (a as AssistantAction) : null;
    case "preview_table":
    case "profile_table":
      return str("table") ? (a as AssistantAction) : null;
    case "show_panel":
      return ["tables", "joins", "history", "snippets"].includes(a.panel as string) ? (a as AssistantAction) : null;
    case "discover_joins":
      return { type: "discover_joins" };
    case "set_join":
      return str("from") && str("to") && (a.verdict === "accepted" || a.verdict === "rejected") ? (a as AssistantAction) : null;
    case "switch_space":
      return str("name") ? (a as AssistantAction) : null;
    default:
      return null;
  }
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
