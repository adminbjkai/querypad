"use client";

import { useMemo, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast, useUiStore } from "@/stores/ui-store";
import { relationshipKey } from "@/lib/discovery/relationships";
import { buildQuerySql, inferJoin, type BuilderJoin, type BuilderTable, type JoinKind } from "@/lib/query-builder/sql";
import { copyText } from "@/lib/export/clipboard";
import { Icon } from "@/components/ui/icons";
import { btn } from "@/components/ui/primitives";

const JOIN_KINDS: JoinKind[] = ["INNER", "LEFT", "RIGHT"];

function sourceColumns(name: string): { name: string; included: boolean }[] {
  const ws = useWorkspaceStore.getState();
  const info = ws.tables.find((t) => t.name === name) ?? ws.views.find((v) => v.name === name);
  return (info?.columns ?? []).map((c) => ({ name: c.name, included: false }));
}

/** Access-style designer: tables, the joins between them, and the SQL that resolves to. */
export default function QueryDesigner() {
  const tables = useWorkspaceStore((s) => s.tables);
  const views = useWorkspaceStore((s) => s.views);
  const [placed, setPlaced] = useState<BuilderTable[]>([]);
  const [joins, setJoins] = useState<BuilderJoin[]>([]);
  const [where, setWhere] = useState("");
  const [adding, setAdding] = useState("");
  const relationships = useWorkspaceStore((s) => s.discovery.relationships);
  const verdicts = useWorkspaceStore((s) => s.relationshipVerdicts);
  const rels = useMemo(
    () => relationships.filter((r) => verdicts[relationshipKey(r)] !== "rejected"),
    [relationships, verdicts]
  );

  const names = useMemo(() => [...tables, ...views].map((t) => t.name), [tables, views]);
  const available = names.filter((n) => !placed.some((p) => p.name === n));
  // Stand-in joins follow a relationship as soon as discovery finishes, without waiting for an edit.
  const resolvedJoins = useMemo(
    () =>
      joins.map((join) => {
        if (!join.automatic) return join;
        const index = placed.findIndex((t) => t.name === join.table);
        if (index <= 0) return join;
        const inferred = inferJoin(join.table, placed.slice(0, index), rels, placed[index].columns);
        if (!inferred || inferred.automatic) return join;
        return { ...join, onTable: inferred.onTable, onColumn: inferred.onColumn, tableColumn: inferred.tableColumn, automatic: false };
      }),
    [joins, placed, rels]
  );
  const built = useMemo(() => buildQuerySql(placed, resolvedJoins, where), [placed, resolvedJoins, where]);

  const addTable = (name: string) => {
    if (!name || placed.some((p) => p.name === name)) return;
    const columns = sourceColumns(name);
    const join = inferJoin(name, placed, rels, columns);
    setPlaced((list) => [...list, { name, columns }]);
    if (join) setJoins((list) => [...list, join]);
    setAdding("");
  };

  const removeTable = (name: string) => {
    setPlaced((list) => list.filter((t) => t.name !== name));
    setJoins((list) => list.filter((j) => j.table !== name && j.onTable !== name));
  };

  const apply = () => {
    if (!built.sql) return;
    const ws = useWorkspaceStore.getState();
    ws.updateTab(ws.activeTabId, { query: built.sql });
    useUiStore.getState().setDesignerOpen(false);
    toast("Query updated from the designer.");
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <Icon name="join" size={15} className="text-join" />
        <span className="text-[13px] font-medium text-ink">Query designer</span>
        <label className="ml-2 flex items-center gap-1.5 text-[12px] text-muted">
          <span className="sr-only">Add a table</span>
          <select
            aria-label="Add a table"
            value={adding}
            onChange={(e) => addTable(e.target.value)}
            className="h-7 max-w-[220px] rounded-md border border-line bg-surface px-2 text-[12px] text-ink"
          >
            <option value="">Add a table…</option>
            {available.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
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
            <p className="max-w-sm text-[13px] text-muted">Each table you add joins on an accepted relationship when one exists. Check the columns to include. The SQL below updates as you go.</p>
          </div>
        ) : (
          <div className="flex min-w-max items-stretch gap-3">
            {placed.map((table, index) => {
              const join = resolvedJoins.find((j) => j.table === table.name);
              return (
                <div key={table.name} className="flex items-stretch gap-3">
                  {index > 0 && (
                    <div className="flex w-44 flex-col justify-center gap-1.5">
                      <span className="h-px w-full bg-join" />
                      {join ? (
                        <>
                          <select
                            aria-label={`Join type for ${table.name}`}
                            value={join.kind}
                            onChange={(e) => setJoins((list) => list.map((j) => (j.table === table.name ? { ...j, kind: e.target.value as JoinKind, automatic: false } : j)))}
                            className="h-7 rounded-md border border-line bg-surface px-1.5 font-mono text-[11px] text-ink"
                          >
                            {JOIN_KINDS.map((k) => (
                              <option key={k} value={k}>{k} JOIN</option>
                            ))}
                          </select>
                          <label className="text-[11px] text-muted">
                            On
                            <select
                              aria-label={`Join ${join.onTable} column`}
                              value={join.onColumn}
                              onChange={(e) => setJoins((list) => list.map((j) => (j.table === table.name ? { ...j, onColumn: e.target.value, automatic: false } : j)))}
                              className="mt-0.5 h-7 w-full rounded-md border border-line bg-surface px-1 font-mono text-[11px] text-ink"
                            >
                              {(placed.find((t) => t.name === join.onTable)?.columns ?? []).map((c) => (
                                <option key={c.name} value={c.name}>{join.onTable}.{c.name}</option>
                              ))}
                            </select>
                          </label>
                          <label className="text-[11px] text-muted">
                            Equals
                            <select
                              aria-label={`Join ${table.name} column`}
                              value={join.tableColumn}
                              onChange={(e) => setJoins((list) => list.map((j) => (j.table === table.name ? { ...j, tableColumn: e.target.value, automatic: false } : j)))}
                              className="mt-0.5 h-7 w-full rounded-md border border-line bg-surface px-1 font-mono text-[11px] text-ink"
                            >
                              {table.columns.map((c) => (
                                <option key={c.name} value={c.name}>{table.name}.{c.name}</option>
                              ))}
                            </select>
                          </label>
                        </>
                      ) : (
                        <p className="text-center text-[11px] text-warn">No join yet. This table is left out of the SQL.</p>
                      )}
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
