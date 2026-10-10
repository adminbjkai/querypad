import { isReadOnlyStatement, leading } from "../duckdb/catalog-sql";
import { stripSqlLiterals } from "../duckdb/sql-utils";

/**
 * The Agent's plan protocol: the model answers with a sentence and ONE fenced ```json block
 * `{"summary": "...", "steps": [{"title": "...", "sql": "..."}]}`. These pure functions parse that
 * reply, classify each step by how much it can damage, and describe what a run changed. No
 * browser or DuckDB APIs, so the CLI test runner can exercise them.
 */

export type StepKind = "read" | "write" | "danger";
export type StepStatus = "pending" | "approved" | "skipped" | "running" | "ok" | "error";

export interface StepResult {
  columns: string[];
  columnTypes: string[];
  /** The first rows only (see RESULT_ROWS_KEPT in the store). */
  rows: Record<string, unknown>[];
  rowCount: number;
  ms: number;
  /** Rows an INSERT/UPDATE/DELETE touched, when DuckDB reported it. */
  affected?: number;
  /** Set when the step created a notebook; the plan card opens it from here. */
  notebookId?: string;
}

/** A notebook the agent will create: SQL cells the notebook can run, and markdown text cells. */
export interface NotebookCellDraft {
  kind: "sql" | "markdown";
  source: string;
}

export interface NotebookDraft {
  name: string;
  cells: NotebookCellDraft[];
}

export interface PlanStep {
  id: string;
  title: string;
  sql: string;
  /** Set when this step creates a notebook instead of running SQL. */
  notebook?: NotebookDraft | null;
  kind: StepKind;
  status: StepStatus;
  result?: StepResult;
  error?: string;
}

export interface ParsedPlan {
  summary: string;
  steps: { title: string; sql: string; notebook: NotebookDraft | null }[];
}

export interface PlanReply {
  /** The model's words outside the JSON block (Markdown). */
  prose: string;
  /** Null when the reply had no usable plan (then it's a plain answer). */
  plan: ParsedPlan | null;
}

const FENCED_JSON = /```(?:json)?\s*\n?([\s\S]*?)```/i;

/** Find the first JSON object in `text`: a fenced block, or the outermost braces as a fallback. */
export function extractJson(text: string): { json: unknown; rest: string } | null {
  const fenced = text.match(FENCED_JSON);
  if (fenced) {
    const parsed = tryParse(fenced[1]);
    if (parsed !== undefined) return { json: parsed, rest: text.replace(fenced[0], "").trim() };
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const parsed = tryParse(text.slice(start, end + 1));
    if (parsed !== undefined) return { json: parsed, rest: `${text.slice(0, start)}${text.slice(end + 1)}`.trim() };
  }
  return null;
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text.trim());
  } catch {
    return undefined;
  }
}

const stripSemicolon = (sql: string) => sql.trim().replace(/;\s*$/, "").trim();

const MAX_NOTEBOOK_CELLS = 40;
const MAX_CELL_SOURCE = 12_000;

/**
 * A notebook step: `{ name, cells: [{ kind: "sql"|"markdown", source }] }`.
 * Python is not a notebook cell (nothing here runs it). A `python` cell is kept as a
 * text cell with the source in a python fence so the code is not thrown away.
 */
export function parseNotebookDraft(value: unknown): NotebookDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as { name?: unknown; cells?: unknown };
  if (!Array.isArray(raw.cells)) return null;
  const cells: NotebookCellDraft[] = [];
  for (const cell of raw.cells) {
    if (cells.length >= MAX_NOTEBOOK_CELLS) break;
    if (typeof cell !== "object" || cell === null) continue;
    const item = cell as { kind?: unknown; type?: unknown; source?: unknown; sql?: unknown };
    const kindRaw = (typeof item.kind === "string" ? item.kind : typeof item.type === "string" ? item.type : "").trim().toLowerCase();
    const sourceRaw = typeof item.source === "string" ? item.source : typeof item.sql === "string" ? item.sql : "";
    const source = sourceRaw.trim().slice(0, MAX_CELL_SOURCE);
    if (!source) continue;
    if (kindRaw === "sql" || kindRaw === "query") cells.push({ kind: "sql", source });
    else if (kindRaw === "markdown" || kindRaw === "md" || kindRaw === "text") cells.push({ kind: "markdown", source });
    else if (kindRaw === "python" || kindRaw === "py") {
      const code = source.replace(/^```(?:python|py)?\s*/i, "").replace(/```$/, "").trim();
      if (code) cells.push({ kind: "markdown", source: `Python does not run in a QueryPad notebook. The code is kept here as text.\n\n\`\`\`python\n${code}\n\`\`\`` });
    }
  }
  if (cells.length === 0) return null;
  const name = (typeof raw.name === "string" ? raw.name.trim() : "").slice(0, 80) || "Notebook";
  return { name, cells };
}

/** One short description of a step for prompts (the SQL, or the notebook it creates). */
export function stepScript(step: { sql: string; notebook?: NotebookDraft | null }): string {
  if (step.notebook) {
    const sql = step.notebook.cells.filter((c) => c.kind === "sql").length;
    const text = step.notebook.cells.length - sql;
    return `notebook "${step.notebook.name}" (${sql} SQL, ${text} text)`;
  }
  return step.sql.replace(/\s+/g, " ");
}

/** A readable title when the model gave none: the statement's first words. */
export function titleFromSql(sql: string): string {
  const flat = leading(sql).replace(/\s+/g, " ").trim();
  return flat.length > 70 ? `${flat.slice(0, 69).trimEnd()}…` : flat || "Step";
}

/**
 * Parse a plan reply. Tolerant of a missing fence, a `steps` list without titles, and prose
 * around the block; a reply whose JSON has no non-empty `sql` steps is treated as prose only.
 */
export function parsePlan(text: string): PlanReply {
  const found = extractJson(text);
  if (!found || typeof found.json !== "object" || found.json === null) return { prose: text.trim(), plan: null };
  const raw = found.json as { summary?: unknown; steps?: unknown };
  if (!Array.isArray(raw.steps)) return { prose: text.trim(), plan: null };
  const steps = raw.steps
    .filter((s): s is { title?: unknown; sql?: unknown; notebook?: unknown } => typeof s === "object" && s !== null)
    .map((s) => {
      const notebook = parseNotebookDraft(s.notebook);
      const sql = notebook ? "" : typeof s.sql === "string" ? stripSemicolon(s.sql) : "";
      const title = typeof s.title === "string" ? s.title.trim() : "";
      return { sql, notebook, title: title || (notebook ? `Create notebook ${notebook.name}` : titleFromSql(sql)) };
    })
    .filter((s) => s.notebook !== null || s.sql.length > 0);
  if (steps.length === 0) return { prose: text.trim(), plan: null };
  const summary = typeof raw.summary === "string" && raw.summary.trim() ? raw.summary.trim() : `${steps.length} ${steps.length === 1 ? "step" : "steps"}`;
  return { prose: found.rest, plan: { summary, steps } };
}

/**
 * Why a statement is dangerous (it destroys or rewrites data wholesale), or null: DROP, TRUNCATE,
 * DELETE or UPDATE without a WHERE, and ALTER … DROP. These always need the per-step click plus
 * a confirmation, whatever the approval setting.
 */
export function dangerReason(sql: string): string | null {
  const stripped = stripSqlLiterals(sql).replace(/;\s*$/, "");
  // The plan is model output: a step is gated as ONE statement, so several statements in one
  // step (`SELECT 1; DROP TABLE t`) can never ride on the first keyword's classification.
  if (stripped.includes(";")) return "contains several statements";
  const text = leading(stripped).trim();
  if (/^drop\b/i.test(text)) return "drops an object";
  if (/^truncate\b/i.test(text)) return "empties a table";
  // A CTE-wrapped write is judged by the write itself, not by a WHERE inside the CTE.
  const write = /^with\b/i.test(text) ? text.replace(/^[\s\S]*?(?=\b(?:delete\s+from|update)\b)/i, "") : text;
  if (/^delete\b/i.test(write) && !/\bwhere\b/i.test(write)) return "deletes every row";
  if (/^update\b/i.test(write) && !/\bwhere\b/i.test(write)) return "rewrites every row";
  if (/^alter\s+table\b[\s\S]*\bdrop\b/i.test(text)) return "drops a column or constraint";
  if (/^create\s+or\s+replace\s+table\b/i.test(text)) return "replaces an existing table";
  return null;
}

export function classifyStep(sql: string): StepKind {
  if (dangerReason(sql)) return "danger";
  return isReadOnlyStatement(sql) ? "read" : "write";
}

/** Plan steps ready to run, in order, each with an id and classification. */
export function toPlanSteps(plan: ParsedPlan, newId: () => string): PlanStep[] {
  return plan.steps.map((s) => ({
    id: newId(),
    title: s.title,
    sql: s.sql,
    notebook: s.notebook,
    // A notebook changes the space's library, so it waits for approval like any other write.
    kind: s.notebook ? "write" : classifyStep(s.sql),
    status: "pending",
  }));
}

/** Avoid clobbering a notebook the user already has. */
export function nextNotebookName(name: string, existing: string[]): string {
  const taken = new Set(existing);
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name} ${n}`)) n += 1;
  return `${name} ${n}`;
}

/** The table a CREATE TABLE/VIEW step makes, lower-cased, so the session can track what it owns. */
export function createdObject(sql: string): string | null {
  const match = leading(sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ")).match(/^create\s+(?:or\s+replace\s+)?(?:temp(?:orary)?\s+)?(table|view)\s+(?:if\s+not\s+exists\s+)?(?:[\w$]+\.)?("(?:[^"]|"")+"|[\w$]+)/i);
  if (!match) return null;
  const name = match[2];
  return (name.startsWith('"') ? name.slice(1, -1).replaceAll('""', '"') : name).toLowerCase();
}

// --- What a run changed ---------------------------------------------------------------

export interface CatalogSnapshot {
  tables: { name: string; rowCount: number }[];
  views: string[];
}

export interface CatalogDiff {
  tablesAdded: string[];
  tablesRemoved: string[];
  /** Tables present before and after whose row count moved. */
  rowDeltas: { name: string; before: number; after: number }[];
  viewsAdded: string[];
  viewsRemoved: string[];
}

export function diffCatalog(before: CatalogSnapshot, after: CatalogSnapshot): CatalogDiff {
  const was = new Map(before.tables.map((t) => [t.name, t.rowCount]));
  const now = new Map(after.tables.map((t) => [t.name, t.rowCount]));
  const beforeViews = new Set(before.views);
  const afterViews = new Set(after.views);
  return {
    tablesAdded: after.tables.filter((t) => !was.has(t.name)).map((t) => t.name),
    tablesRemoved: before.tables.filter((t) => !now.has(t.name)).map((t) => t.name),
    rowDeltas: after.tables
      .filter((t) => was.has(t.name) && was.get(t.name) !== t.rowCount)
      .map((t) => ({ name: t.name, before: was.get(t.name) ?? 0, after: t.rowCount })),
    viewsAdded: after.views.filter((v) => !beforeViews.has(v)),
    viewsRemoved: before.views.filter((v) => !afterViews.has(v)),
  };
}

/** One line per change, for the model and the summary card. */
export function describeDiff(diff: CatalogDiff): string[] {
  const lines: string[] = [];
  for (const t of diff.tablesAdded) lines.push(`created table ${t}`);
  for (const t of diff.tablesRemoved) lines.push(`dropped table ${t}`);
  for (const d of diff.rowDeltas) lines.push(`${d.name}: ${d.before.toLocaleString("en-US")} → ${d.after.toLocaleString("en-US")} rows`);
  for (const v of diff.viewsAdded) lines.push(`created view ${v}`);
  for (const v of diff.viewsRemoved) lines.push(`dropped view ${v}`);
  return lines;
}

// --- The completion summary -----------------------------------------------------------

export interface SummaryReply {
  text: string;
  suggestions: string[];
}

/** The model's closing words plus its follow-up ideas (a ```json {"suggestions": [...]} block). */
export function parseSummary(text: string): SummaryReply {
  const found = extractJson(text);
  const raw = found && typeof found.json === "object" && found.json !== null ? (found.json as { suggestions?: unknown; summary?: unknown }) : null;
  const suggestions = Array.isArray(raw?.suggestions)
    ? raw.suggestions.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim()).slice(0, 3)
    : [];
  const prose = (found?.rest ?? text).trim();
  const fallback = typeof raw?.summary === "string" ? raw.summary.trim() : "";
  return { text: prose || fallback, suggestions };
}
