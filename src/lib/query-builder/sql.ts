import { quoteIdent } from "../duckdb/sql-utils";

/** How a table is joined onto the tables already in the query. */
export type JoinKind = "INNER" | "LEFT" | "RIGHT";

export interface BuilderColumn {
  name: string;
  included: boolean;
}

export interface BuilderTable {
  name: string;
  columns: BuilderColumn[];
}

/** `table` is the one being added. `onTable` is already in the FROM clause. */
export interface BuilderJoin {
  table: string;
  onTable: string;
  tableColumn: string;
  onColumn: string;
  kind: JoinKind;
  /** True when matched on a shared column name; a discovered relationship replaces it. */
  automatic?: boolean;
}

export interface JoinEnd {
  table: string;
  column: string;
}

export interface BuiltQuery {
  sql: string;
  /** Tables that were left out because nothing joins them to the query. */
  unjoined: string[];
}

/**
 * Join to use when `name` is added after `placed`. A discovered relationship wins. Otherwise a
 * key-like column (`*_id`, `*_key`, `*_code`) with the same name in both tables is used and
 * marked `automatic`, so a relationship found later replaces it. Same-named columns that aren't
 * keys (`name`, `created_at`…) are never joined on. With neither, there is no join: the table
 * stays out of the SQL until the user picks the columns, rather than joining on a guess.
 */
const KEY_LIKE = /^.+_(id|key|code)$/i;

export function inferJoin(
  name: string,
  placed: { name: string; columns: { name: string }[] }[],
  relationships: { from: JoinEnd; to: JoinEnd }[],
  columns: { name: string }[]
): BuilderJoin | null {
  const placedNames = new Set(placed.map((table) => table.name));
  for (const rel of relationships) {
    if (rel.from.table === name && placedNames.has(rel.to.table)) {
      return {
        table: name,
        onTable: rel.to.table,
        tableColumn: rel.from.column,
        onColumn: rel.to.column,
        kind: "INNER",
      };
    }
    if (rel.to.table === name && placedNames.has(rel.from.table)) {
      return {
        table: name,
        onTable: rel.from.table,
        tableColumn: rel.to.column,
        onColumn: rel.from.column,
        kind: "INNER",
      };
    }
  }
  let match: BuilderJoin | null = null;
  for (const other of placed) {
    for (const column of columns) {
      if (!KEY_LIKE.test(column.name)) continue;
      const same = other.columns.find((c) => c.name.toLowerCase() === column.name.toLowerCase());
      if (!same) continue;
      const join: BuilderJoin = { table: name, onTable: other.name, tableColumn: column.name, onColumn: same.name, kind: "INNER", automatic: true };
      if (/_id$/i.test(column.name)) return join;
      match ??= join;
    }
  }
  return match;
}

/**
 * The SQL a visual query resolves to. The first table is the FROM anchor.
 * Later tables join on, in order, when a join names them. Checked columns
 * become the select list; with none checked the query is `SELECT *`. A column
 * name checked in more than one table is aliased `<table>_<column>`, so every
 * output column keeps a distinct name.
 */
export function buildQuerySql(tables: BuilderTable[], joins: BuilderJoin[], where = ""): BuiltQuery {
  if (tables.length === 0) return { sql: "", unjoined: [] };
  const present = new Set<string>();
  const used: BuilderTable[] = [];
  const unjoined: string[] = [];
  const from: string[] = [];

  tables.forEach((table, index) => {
    if (index === 0) {
      present.add(table.name);
      used.push(table);
      from.push(quoteIdent(table.name));
      return;
    }
    const join = joins.find((j) => j.table === table.name && present.has(j.onTable));
    if (!join) {
      unjoined.push(table.name);
      return;
    }
    present.add(table.name);
    used.push(table);
    const kind = join.kind === "INNER" ? "INNER JOIN" : join.kind === "LEFT" ? "LEFT JOIN" : "RIGHT JOIN";
    from.push(
      `${kind} ${quoteIdent(table.name)} ON ${quoteIdent(join.onTable)}.${quoteIdent(join.onColumn)} = ${quoteIdent(table.name)}.${quoteIdent(join.tableColumn)}`
    );
  });

  const picked = used.flatMap((table) => table.columns.filter((c) => c.included).map((c) => ({ table: table.name, column: c.name })));
  // DuckDB compares column names case-insensitively, so "ID" and "id" collide too.
  const counts = new Map<string, number>();
  for (const { column } of picked) counts.set(column.toLowerCase(), (counts.get(column.toLowerCase()) ?? 0) + 1);
  const taken = new Set(picked.filter(({ column }) => counts.get(column.toLowerCase()) === 1).map(({ column }) => column.toLowerCase()));
  const selected = picked.map(({ table, column }) => {
    const ref = `${quoteIdent(table)}.${quoteIdent(column)}`;
    if (counts.get(column.toLowerCase()) === 1) return ref;
    let alias = `${table}_${column}`;
    for (let n = 2; taken.has(alias.toLowerCase()); n++) alias = `${table}_${column}_${n}`;
    taken.add(alias.toLowerCase());
    return `${ref} AS ${quoteIdent(alias)}`;
  });
  const list = selected.length > 0 ? selected.join(",\n  ") : "*";
  const criteria = where.trim();
  const sql = `SELECT ${list}\nFROM ${from.join("\n")}${criteria ? `\nWHERE ${criteria}` : ""}`;
  return { sql, unjoined };
}
