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
  /** True when the columns are a stand-in until a real relationship is known. */
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
 * The SQL a visual query resolves to. The first table is the FROM anchor.
 * Later tables join on, in order, when a join names them. Checked columns
 * become the select list; with none checked the query is `SELECT *`.
 */
/**
 * Join to use when `name` is added after `placed`. An inferred relationship wins.
 * Otherwise the first columns are joined so the SQL updates immediately (`automatic`).
 */
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
  const anchor = placed[0];
  if (anchor && columns[0] && anchor.columns[0]) {
    return {
      table: name,
      onTable: anchor.name,
      tableColumn: columns[0].name,
      onColumn: anchor.columns[0].name,
      kind: "INNER",
      automatic: true,
    };
  }
  return null;
}

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

  const selected: string[] = [];
  for (const table of used) {
    for (const column of table.columns) {
      if (column.included) selected.push(`${quoteIdent(table.name)}.${quoteIdent(column.name)}`);
    }
  }
  const list = selected.length > 0 ? selected.join(",\n  ") : "*";
  const criteria = where.trim();
  const sql = `SELECT ${list}\nFROM ${from.join("\n")}${criteria ? `\nWHERE ${criteria}` : ""}`;
  return { sql, unjoined };
}
