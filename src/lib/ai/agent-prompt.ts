import type { CatalogDiff } from "../agent/plan";
import { describeDiff } from "../agent/plan";
import type { PlanStep } from "../agent/plan";

/**
 * Prompts for the Agent page: a planning, write-capable AI that does multi-step work on the
 * user's DuckDB tables. The model never executes anything itself — it answers with a plan,
 * QueryPad runs each step behind its approval gate and reports back. Pure strings and
 * functions so the protocol can be unit-tested.
 */

export const AGENT_SYSTEM_PROMPT = `You are the QueryPad Agent: you plan and carry out multi-step work on the user's data in QueryPad, a local-first data workspace where every file is a DuckDB table (DuckDB SQL dialect, main schema). Each request comes with the live workspace: tables, columns with value hints, views, inferred joins, recent runs, and the objects you created earlier in this session.

How you answer: first ONE short sentence (what you'll do, in plain words), then exactly ONE fenced \`\`\`json block:
{"summary": "one line describing the plan", "steps": [{"title": "what this step does", "sql": "one SQL statement"}]}
Nothing after the block. Every step is a single DuckDB statement without a trailing semicolon; put several statements in several steps, in the order they must run. QueryPad runs the steps itself: reads run automatically, writes wait for the user's approval, and destructive steps (DROP, TRUNCATE, DELETE/UPDATE without WHERE, ALTER … DROP) need an extra confirmation — keep them to a minimum and never DROP, TRUNCATE or replace anything you did not create in this session. When the request is only a question that needs no change, answer in prose (Markdown) with no JSON block.

Rules for the SQL:
- Use only tables, views and columns listed in the context, spelled exactly; double-quote identifiers that aren't plain lower_snake_case.
- Join only on the listed joins. QueryPad's inferred keys are queryable as querypad.relationships and querypad.keys; use information_schema.columns or DESCRIBE for column details.
- When you create a schema: lower_snake_case names, one table per entity, an explicit PRIMARY KEY on every table (an INTEGER id or a natural key), FOREIGN KEY columns named <table_singular>_id referencing the parent's key, sensible types (INTEGER, DECIMAL(12,2), DATE, TIMESTAMP, VARCHAR, BOOLEAN), and NOT NULL where the data requires it. Say which keys you chose and why in the step titles.
- When asked for sample or demo data, INSERT realistic, varied rows (names, dates spread over months, amounts with cents, a few edge cases) — at least 5 per table, and consistent with the keys so joins work.
- Make steps idempotent where it costs nothing (CREATE TABLE IF NOT EXISTS, INSERT … ON CONFLICT DO NOTHING), prefer additive changes, and finish with a read step that shows the user what changed (a COUNT or a short SELECT).
- Use filter values that actually occur (see the column hints).`;

/** The user's request with the live workspace state attached (first turn and re-plans). */
export function agentTurnInput(context: string, message: string, createdThisSession: string[]): string {
  const owned = createdThisSession.length > 0 ? `\nObjects you created in this session (you may change or drop these): ${createdThisSession.join(", ")}` : "";
  return `Workspace state right now:\n${context}${owned}\n\nRequest: ${message}`;
}

/** What the model gets after a step failed: fix that step and give the rest of the plan again. */
export function retryInput(context: string, steps: PlanStep[], failed: PlanStep, createdThisSession: string[]): string {
  const done = steps.filter((s) => s.status === "ok").map((s) => `- ${s.title}: ${s.sql.replace(/\s+/g, " ")}`);
  const remaining = steps.filter((s) => s !== failed && s.status === "pending").map((s) => `- ${s.title}: ${s.sql.replace(/\s+/g, " ")}`);
  const owned = createdThisSession.length > 0 ? `\nObjects you created in this session: ${createdThisSession.join(", ")}` : "";
  return [
    `Workspace state right now:\n${context}${owned}`,
    "",
    done.length > 0 ? `Steps that already ran successfully (do not repeat them):\n${done.join("\n")}` : "No step has run yet.",
    "",
    `This step failed:\n${failed.sql}\nDuckDB said: ${failed.error ?? "unknown error"}`,
    remaining.length > 0 ? `\nSteps that had not run yet:\n${remaining.join("\n")}` : "",
    "",
    "Give a revised plan (same JSON format) that fixes the failed step and includes every step still needed to finish the request. Start from the corrected step.",
  ].join("\n");
}

export const AGENT_SUMMARY_PROMPT = `You are the QueryPad Agent writing the closing note after running a plan on the user's DuckDB tables. Reply with 2–3 plain sentences in Markdown: what now exists or changed (name the tables, the keys chosen and why, and row counts) and anything the user should check. Then exactly ONE fenced \`\`\`json block: {"suggestions": ["…", "…", "…"]} — three short follow-up requests the user could give you next (imperative, under 70 characters each, e.g. "Add a date dimension table"). Nothing after the block.`;

/** What the model gets after every step finished: the steps and what the catalog diff shows. */
export function summaryInput(request: string, steps: PlanStep[], diff: CatalogDiff): string {
  const ran = steps.map((s) => {
    const outcome =
      s.status === "ok"
        ? s.result?.affected !== undefined
          ? `ok, ${s.result.affected} rows affected`
          : `ok, ${s.result?.rowCount ?? 0} rows`
        : s.status === "skipped"
          ? "skipped by the user"
          : s.status === "error"
            ? `failed: ${s.error ?? ""}`
            : s.status;
    return `- [${outcome}] ${s.title} — ${s.sql.replace(/\s+/g, " ").slice(0, 300)}`;
  });
  const changes = describeDiff(diff);
  return [
    `The user asked: ${request}`,
    "",
    "Steps and outcomes:",
    ...ran,
    "",
    changes.length > 0 ? `Catalog changes measured by QueryPad:\n${changes.map((c) => `- ${c}`).join("\n")}` : "QueryPad measured no catalog change (tables and row counts are as before).",
  ].join("\n");
}
