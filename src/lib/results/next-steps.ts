import type { TableInfo } from "../../types";
import type { Relationship, RelationshipVerdict } from "../../types/discovery";
import { relationshipKey } from "../discovery/relationships";
import { classifyType, quoteIdent } from "../duckdb/sql-utils";
import { parseSourceTables } from "./source-tables";

/** A join-aware follow-up to the current result, computed locally (no model call). */
export type NextStep =
  | { kind: "join"; label: string; title: string; sql: string }
  | { kind: "group"; label: string; title: string; sql: string }
  | { kind: "profile"; label: string; table: string };

export interface NextStepsInput {
  /** The SQL that produced the result. */
  sql: string;
  columns: string[];
  columnTypes: string[];
  tables: TableInfo[];
  relationships: Relationship[];
  verdicts: Record<string, RelationshipVerdict>;
}

const MAX_STEPS = 3;

/** The SQL without trailing semicolons/whitespace, or null when it holds several statements. */
function singleStatement(sql: string): string | null {
  const text = sql.trim().replace(/;+\s*$/, "").trim();
  if (!text || text.includes(";")) return null;
  return text;
}

/**
 * Up to three instant follow-ups: a verified join to a related table the query does not use yet
 * (accepted relationships first, then by confidence), a group-and-count over the first text
 * column, and the main table's profile page.
 */
export function computeNextSteps(input: NextStepsInput): NextStep[] {
  const steps: NextStep[] = [];
  const names = new Set(input.tables.map((t) => t.name));
  const sources = parseSourceTables(input.sql);
  const used = new Set(sources.map((s) => s.table));
  const main = sources.find((s) => names.has(s.table))?.table ?? null;

  if (main) {
    const candidates = input.relationships
      .filter((rel) => input.verdicts[relationshipKey(rel)] !== "rejected")
      .filter((rel) => (rel.from.table === main && !used.has(rel.to.table)) || (rel.to.table === main && !used.has(rel.from.table)))
      .filter((rel) => names.has(rel.from.table) && names.has(rel.to.table))
      .sort((a, b) => {
        const acc = (r: Relationship) => (input.verdicts[relationshipKey(r)] === "accepted" ? 1 : 0);
        return acc(b) - acc(a) || b.confidence - a.confidence;
      });
    const rel = candidates[0];
    if (rel) {
      const other = rel.from.table === main ? rel.to.table : rel.from.table;
      const on = rel.from.column === rel.to.column ? rel.from.column : `${rel.from.column} = ${rel.to.column}`;
      const overlap = Math.round(rel.signals.valueOverlap * 100);
      const q = quoteIdent;
      // Every column of the main table, then the other table's columns that don't clash (no duplicate names).
      const mainCols = new Set(input.tables.find((t) => t.name === main)?.columns.map((c) => c.name) ?? []);
      const otherKey = rel.from.table === other ? rel.from.column : rel.to.column;
      const extra = (input.tables.find((t) => t.name === other)?.columns ?? [])
        .map((c) => c.name)
        .filter((c) => c !== otherKey && !mainCols.has(c))
        .map((c) => `${q(other)}.${q(c)}`);
      steps.push({
        kind: "join",
        label: `Join ${main} ↔ ${other} on ${on} (${overlap}% overlap)`,
        title: `Join ${main} ↔ ${other}`,
        sql: `SELECT ${[`${q(main)}.*`, ...extra].join(", ")}\nFROM ${q(main)}\nJOIN ${q(other)} ON ${q(rel.from.table)}.${q(rel.from.column)} = ${q(rel.to.table)}.${q(rel.to.column)}\nLIMIT 100`,
      });
    }
  }

  const statement = singleStatement(input.sql);
  const textIndex = input.columnTypes.findIndex((t) => classifyType(t) === "text");
  if (statement && textIndex >= 0 && /^\s*(select|with|from)\b/i.test(statement)) {
    const col = input.columns[textIndex];
    steps.push({
      kind: "group",
      label: `Group ${col} and count`,
      title: `Group by ${col}`,
      sql: `SELECT ${quoteIdent(col)}, COUNT(*) AS n\nFROM (\n${statement}\n) AS q\nGROUP BY 1\nORDER BY 2 DESC`,
    });
  }

  if (main) steps.push({ kind: "profile", label: `Profile ${main}`, table: main });

  return steps.slice(0, MAX_STEPS);
}
