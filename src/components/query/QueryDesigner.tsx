"use client";

import { useMemo, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast, useUiStore } from "@/stores/ui-store";
import { relationshipKey } from "@/lib/discovery/relationships";
import { buildQuerySql, inferJoin, type BuilderJoin, type BuilderTable, type JoinKind } from "@/lib/query-builder/sql";
import { copyText } from "@/lib/export/clipboard";
import { Icon } from "@/components/ui/icons";
import { Menu, Select, btn, type SelectOption } from "@/components/ui/primitives";

const JOIN_KINDS: SelectOption<JoinKind>[] = [
  { value: "INNER", label: "INNER JOIN" },
  { value: "LEFT", label: "LEFT JOIN" },
  { value: "RIGHT", label: "RIGHT JOIN" },
];

function sourceColumns(name: string): { name: string; included: boolean }[] {
  const ws = useWorkspaceStore.getState();
  const info = ws.tables.find((t) => t.name === name) ?? ws.views.find((v) => v.name === name);
  return (info?.columns ?? []).map((c) => ({ name: c.name, included: false }));
}

const complete = (join: BuilderJoin) => !!(join.onTable && join.onColumn && join.tableColumn);
/** Select value for "table.column" (JSON, so dots in names stay unambiguous). */
const endKey = (table: string, column: string) => JSON.stringify([table, column]);

/** Access-style designer: tables, the joins between them, and the SQL that resolves to. */
export default function QueryDesigner() {
  const tables = useWorkspaceStore((s) => s.tables);
  const views = useWorkspaceStore((s) => s.views);
  const [placed, setPlaced] = useState<BuilderTable[]>([]);
  // Joins the user set or edited (possibly half-picked). Tables without one use `inferJoin`.
  const [joins, setJoins] = useState<BuilderJoin[]>([]);
  const [where, setWhere] = useState("");
  const relationships = useWorkspaceStore((s) => s.discovery.relationships);
  const verdicts = useWorkspaceStore((s) => s.relationshipVerdicts);
  const rels = useMemo(
    () => relationships.filter((r) => verdicts[relationshipKey(r)] !== "rejected"),
    [relationships, verdicts]
  );

  const names = useMemo(() => [...tables, ...views].map((t) => t.name), [tables, views]);
  const available = names.filter((n) => !placed.some((p) => p.name === n));
  // Inferred joins follow discovery as it finishes, without waiting for an edit.
  const resolvedJoins = useMemo(
    () =>
      placed.flatMap((table, index): BuilderJoin[] => {
        if (index === 0) return [];
        const before = placed.slice(0, index);
        const own = joins.find((j) => j.table === table.name);
        if (own && complete(own) && before.some((t) => t.name === own.onTable)) return [own];
        const inferred = inferJoin(table.name, before, rels, table.columns);
        return inferred ? [inferred] : [];
      }),
    [joins, placed, rels]
  );
  const built = useMemo(() => buildQuerySql(placed, resolvedJoins, where), [placed, resolvedJoins, where]);

  const addTable = (name: string) => {
    if (placed.some((p) => p.name === name)) return;
    setPlaced((list) => [...list, { name, columns: sourceColumns(name) }]);
  };

  const removeTable = (name: string) => {
    setPlaced((list) => list.filter((t) => t.name !== name));
    setJoins((list) => list.filter((j) => j.table !== name && j.onTable !== name));
  };

  const editJoin = (table: string, patch: Partial<BuilderJoin>) => {
    const base =
      resolvedJoins.find((j) => j.table === table) ??
      joins.find((j) => j.table === table) ?? { table, onTable: "", onColumn: "", tableColumn: "", kind: "INNER" as const };
    setJoins((list) => [...list.filter((j) => j.table !== table), { ...base, ...patch, automatic: false }]);
  };

  const apply = () => {
    if (!built.sql) return;
    const ws = useWorkspaceStore.getState();
    const current = ws.tabs.find((t) => t.id === ws.activeTabId)?.query.trim() ?? "";
    if (current && current !== built.sql.trim()) {
      // Never overwrite the user's own SQL: the designer's query gets a tab of its own.
      if (!ws.addTab(built.sql)) return;
      useUiStore.getState().setDesignerOpen(false);
      toast("Opened the designer's SQL in a new tab. Your query is unchanged.");
      return;
    }
    ws.updateTab(ws.activeTabId, { query: built.sql });
    useUiStore.getState().setDesignerOpen(false);
    toast("Query updated from the designer.");
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <Icon name="join" size={15} className="text-join" />
        <span className="text-[13px] font-medium text-ink">Query designer</span>
        <Menu
          label="Add a table"
          align="left"
          items={
            available.length > 0
              ? available.map((n) => ({ label: n, icon: "table" as const, onSelect: () => addTable(n) }))
              : [{ label: "Every table is placed", disabled: true, onSelect: () => undefined }]
          }
          trigger={({ open, toggle }) => (
            <button type="button" onClick={toggle} aria-expanded={open} aria-haspopup="menu" className={`${btn.secondary} ml-2 h-7 px-2 text-[12px]`}>
              <Icon name="plus" size={14} /> Add table
            </button>
          )}
        />
        <span className="flex-1" />
        <button type="button" onClick={() => void copyText(built.sql).then(() => toast("SQL copied."))} disabled={!built.sql} className={btn.ghost}>
          <Icon name="copy" size={14} /> Copy SQL
        </button>
        <button type="button" onClick={apply} disabled={!built.sql} className={btn.primary}>
          Use in editor
        </button>
        <button type="button" onClick={() => useUiStore.getState().setDesignerOpen(false)} className={btn.icon} aria-label="Close query designer" title="Back to the SQL editor">
          <Icon name="x" size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {placed.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-[14px] font-medium text-ink">Add the tables you want to query</p>
            <p className="max-w-sm text-[13px] text-muted">
              Each table you add joins on a discovered relationship, or on a column name both tables share. You can change the join or pick it yourself. Check the columns to include. The SQL below updates as you go.
            </p>
          </div>
        ) : (
          <div className="flex min-w-max items-stretch gap-3">
            {placed.map((table, index) => {
              const join = resolvedJoins.find((j) => j.table === table.name);
              const shown = join ?? joins.find((j) => j.table === table.name);
              const own = joins.some((j) => j.table === table.name && j === join);
              const otherOptions: SelectOption<string>[] = placed
                .slice(0, index)
                .flatMap((t) => t.columns.map((c) => ({ value: endKey(t.name, c.name), label: `${t.name}.${c.name}` })));
              const thisOptions: SelectOption<string>[] = table.columns.map((c) => ({ value: c.name, label: `${table.name}.${c.name}` }));
              const otherValue = shown?.onTable && shown.onColumn ? endKey(shown.onTable, shown.onColumn) : "";
              const thisValue = shown?.tableColumn ?? "";
              const pick: SelectOption<string> = { value: "", label: "Pick a column…", disabled: true };
              return (
                <div key={table.name} className="flex items-stretch gap-3">
                  {index > 0 && (
                    <div className="flex w-48 flex-col justify-center gap-1.5">
                      <span className="h-px w-full bg-join" />
                      <Select
                        ariaLabel={`Join type for ${table.name}`}
                        size="sm"
                        value={shown?.kind ?? "INNER"}
                        options={JOIN_KINDS}
                        onChange={(kind) => editJoin(table.name, { kind })}
                        className="w-full font-mono"
                      />
                      <Select
                        ariaLabel={`Join ${table.name} on`}
                        size="sm"
                        value={otherValue}
                        options={otherValue ? otherOptions : [pick, ...otherOptions]}
                        onChange={(value) => {
                          const [onTable, onColumn] = JSON.parse(value) as [string, string];
                          editJoin(table.name, { onTable, onColumn });
                        }}
                        className="w-full font-mono"
                      />
                      <span className="text-center text-[11px] text-muted">equals</span>
                      <Select
                        ariaLabel={`Join ${table.name} column`}
                        size="sm"
                        value={thisValue}
                        options={thisValue ? thisOptions : [pick, ...thisOptions]}
                        onChange={(tableColumn) => editJoin(table.name, { tableColumn })}
                        className="w-full font-mono"
                      />
                      <p className={`text-center text-[11px] ${join ? "text-faint" : "text-warn"}`}>
                        {!join
                          ? "Not joined yet. Pick both columns."
                          : own
                            ? "Your join"
                            : join.automatic
                              ? "Matched by column name"
                              : "From a discovered relationship"}
                      </p>
                      <span className="h-px w-full bg-join" />
                    </div>
                  )}
                  <section className="w-56 overflow-hidden rounded-lg border border-line bg-chrome shadow-sm" aria-label={table.name}>
                    <header className="flex h-8 items-center gap-1.5 border-b border-line bg-raised px-2">
                      <Icon name="table" size={13} className="shrink-0 text-accent" />
                      <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-medium text-ink">{table.name}</span>
                      <button type="button" onClick={() => removeTable(table.name)} className={btn.iconSm} aria-label={`Remove ${table.name}`}>
                        <Icon name="x" size={12} />
                      </button>
                    </header>
                    <ul className="max-h-64 overflow-auto py-1">
                      {table.columns.map((column) => (
                        <li key={column.name}>
                          <label className="flex cursor-pointer items-center gap-2 px-2 py-0.5 text-[12px] hover:bg-sunken">
                            <input
                              type="checkbox"
                              checked={column.included}
                              aria-label={`${table.name}.${column.name}`}
                              onChange={() =>
                                setPlaced((list) =>
                                  list.map((t) =>
                                    t.name === table.name
                                      ? { ...t, columns: t.columns.map((c) => (c.name === column.name ? { ...c, included: !c.included } : c)) }
                                      : t
                                  )
                                )
                              }
                            />
                            <span className="truncate font-mono text-ink">{column.name}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-line bg-chrome">
        <label className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-[12px] text-muted">
          Where
          <input
            aria-label="Where"
            value={where}
            onChange={(e) => setWhere(e.target.value)}
            placeholder="employees.dept_id = 10"
            className="h-7 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 font-mono text-[12px] text-ink placeholder:text-faint"
          />
        </label>
        <div className="flex h-7 items-center gap-2 px-3">
          <span className="text-[11px] font-medium uppercase tracking-wide text-faint">SQL</span>
          {built.unjoined.length > 0 && (
            <span className="text-[11px] text-warn">Not joined: {built.unjoined.join(", ")}</span>
          )}
        </div>
        <pre className="max-h-36 overflow-auto px-3 pb-3 font-mono text-[12px] leading-5 text-ink" aria-label="Resolved SQL">
          {built.sql || "Add a table to see the SQL."}
        </pre>
      </div>
    </div>
  );
}
