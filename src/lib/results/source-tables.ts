import type { TableInfo, TableProfile } from "../../types";
import type { Relationship, RelationshipVerdict } from "../../types/discovery";
import { relationshipKey } from "../discovery/relationships";

/** A table named in a FROM or JOIN clause, with its alias when one was written. */
export interface SourceRef {
  table: string;
  alias: string | null;
}

/** Where a result column comes from, when it can be traced back to a loaded table. */
export interface ColumnRef {
  table: string;
  column: string;
}

/** Key and join facts about a loaded table column, from the discovered relationships. */
export interface ColumnSignals {
  /** Unique across the table (profile, or the column is a discovered key); null when unknown. */
  unique: boolean | null;
  /** Other tables whose foreign columns reference this one. */
  referencedBy: string[];
  /** Keys this column references, with the share of its values found there (0..1). */
  references: { table: string; column: string; overlap: number }[];
}

const ALIAS_STOP = new Set([
  "on", "where", "group", "order", "limit", "join", "left", "right", "inner", "outer", "full", "cross",
  "natural", "using", "union", "having", "select", "with", "as", "lateral", "asof", "semi", "anti",
  "positional", "window", "qualify", "offset", "fetch", "except", "intersect", "values", "sample", "tablesample",
]);

/** Comments and string literals replaced by spaces, so keyword matching never sees quoted text. */
function stripLiterals(sql: string): string {
  return sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/'(?:[^']|'')*'/g, "' '");
}

const unquote = (ident: string) => (ident.startsWith('"') ? ident.slice(1, -1).replaceAll('""', '"') : ident);

/**
 * Tables named in FROM/JOIN clauses, in order (the first one is the query's main source).
 * Schema prefixes are dropped, table functions and subqueries skipped, duplicates removed.
 */
export function parseSourceTables(sql: string): SourceRef[] {
  const code = stripLiterals(sql);
  const ident = String.raw`"(?:[^"]|"")+"|[A-Za-z_][\w$]*`;
  // The alias is captured through a lookahead so a following JOIN keyword stays matchable.
  const re = new RegExp(String.raw`\b(?:from|join)\s+((?:${ident})(?:\.(?:${ident}))*)(?=\s|\(|$|,|;|\))(\s*\()?(?:\s+(?:as\s+)?(?=(${ident})))?`, "gi");
  const out: SourceRef[] = [];
  const seen = new Set<string>();
  for (const m of code.matchAll(re)) {
    if (m[2]) continue; // table function such as read_csv(...)
    const parts = m[1].match(new RegExp(ident, "g")) ?? [];
    const table = unquote(parts[parts.length - 1] ?? "");
    if (!table || seen.has(table)) continue;
    const rawAlias = m[3];
    const alias = rawAlias && !ALIAS_STOP.has(rawAlias.toLowerCase()) ? unquote(rawAlias) : null;
    seen.add(table);
    out.push({ table, alias });
  }
  return out;
}

/** The query's main table (first FROM) when it is a loaded table. */
export function mainSourceTable(sql: string, tables: TableInfo[]): string | null {
  const names = new Set(tables.map((t) => t.name));
  return parseSourceTables(sql).find((s) => names.has(s.table))?.table ?? null;
}

/**
 * Map a result column to a loaded table column: the first source table (in query order) that
 * has a column of that name. Computed and renamed columns have no mapping.
 */
export function mapResultColumn(column: string, sql: string, tables: TableInfo[]): ColumnRef | null {
  const byName = new Map(tables.map((t) => [t.name, t]));
  for (const src of parseSourceTables(sql)) {
    const table = byName.get(src.table);
    if (table?.columns.some((c) => c.name === column)) return { table: src.table, column };
  }
  return null;
}

/** Key/join facts for a table column, from the (non-rejected) relationships and an optional profile. */
export function columnSignals(
  ref: ColumnRef,
  relationships: Relationship[],
  verdicts: Record<string, RelationshipVerdict>,
  profile?: TableProfile | null
): ColumnSignals {
  const referencedBy: string[] = [];
  const references: ColumnSignals["references"] = [];
  for (const rel of relationships) {
    if (verdicts[relationshipKey(rel)] === "rejected") continue;
    if (rel.to.table === ref.table && rel.to.column === ref.column && !referencedBy.includes(rel.from.table)) {
      referencedBy.push(rel.from.table);
    }
    if (rel.from.table === ref.table && rel.from.column === ref.column) {
      references.push({ table: rel.to.table, column: rel.to.column, overlap: rel.signals.valueOverlap });
    }
  }
  const col = profile?.columns.find((c) => c.name === ref.column);
  const unique =
    col && profile && col.distinctCount !== null ? profile.rowCount > 0 && col.distinctCount === profile.rowCount : referencedBy.length > 0 ? true : null;
  return { unique, referencedBy, references };
}
