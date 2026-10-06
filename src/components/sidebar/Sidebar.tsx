"use client";

import { useMemo, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore, type SidebarPanel } from "@/stores/ui-store";
import type { TableInfo } from "@/types";
import { relationshipKey } from "@/lib/discovery/relationships";
import TableSchema from "./TableSchema";
import ProfileDrawer from "./ProfileDrawer";
import RelationshipsPanel from "./RelationshipsPanel";
import HistoryPanel from "./HistoryPanel";
import SnippetsPanel from "./SnippetsPanel";
import PanelHeader, { SearchBox } from "./PanelHeader";
import { Icon, type IconName } from "@/components/ui/icons";
import { btn } from "@/components/ui/primitives";

const PANELS: { id: SidebarPanel; label: string; icon: IconName }[] = [
  { id: "tables", label: "Tables", icon: "table" },
  { id: "joins", label: "Joins", icon: "join" },
  { id: "history", label: "History", icon: "history" },
  { id: "snippets", label: "Snippets", icon: "bookmark" },
];

/** A table or view is listed when its name or any column name contains the (lowercased) filter. */
function matchesFilter(table: TableInfo, q: string): boolean {
  return !q || table.name.toLowerCase().includes(q) || table.columns.some((c) => c.name.toLowerCase().includes(q));
}

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5 px-3 pb-0.5 pt-2.5 text-[11px] font-medium uppercase tracking-wide text-faint">
      <span>{label}</span>
      <span className="font-normal tabular-nums">{count}</span>
    </div>
  );
}

export default function Sidebar() {
  const tables = useWorkspaceStore((s) => s.tables);
  const views = useWorkspaceStore((s) => s.views);
  const discovery = useWorkspaceStore((s) => s.discovery);
  const verdicts = useWorkspaceStore((s) => s.relationshipVerdicts);
  const open = useUiStore((s) => s.sidebarOpen);
  const panel = useUiStore((s) => s.sidebarPanel);
  const showPanel = useUiStore((s) => s.showPanel);
  const setOpen = useUiStore((s) => s.setSidebarOpen);
  const setDialog = useUiStore((s) => s.setDialog);
  const profileTable = useUiStore((s) => s.profileTable);
  const setProfileTable = useUiStore((s) => s.setProfileTable);

  // Columns that take part in a (non-rejected) join, so the tree can mark keys.
  const keyColumns = useMemo(() => {
    const marks = new Map<string, "key" | "ref">();
    for (const rel of discovery.relationships) {
      if (verdicts[relationshipKey(rel)] === "rejected") continue;
      marks.set(`${rel.to.table}.${rel.to.column}`, "key");
      if (!marks.has(`${rel.from.table}.${rel.from.column}`)) marks.set(`${rel.from.table}.${rel.from.column}`, "ref");
    }
    return marks;
  }, [discovery.relationships, verdicts]);

  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const visibleTables = useMemo(() => tables.filter((t) => matchesFilter(t, q)), [tables, q]);
  const visibleViews = useMemo(() => views.filter((t) => matchesFilter(t, q)), [views, q]);

  const visibleProfile = profileTable && tables.some((t) => t.name === profileTable) ? profileTable : null;
  if (!open) return null;

  return (
    <>
      {/* Small screens: the sidebar floats over the workbench. */}
      <div className="fixed inset-0 top-11 z-30 bg-scrim md:hidden" onClick={() => setOpen(false)} />
      <div className="fixed bottom-6 left-0 top-11 z-30 flex md:static md:z-auto">
        <aside className="flex h-full border-r border-line bg-chrome" aria-label="Workspace sidebar">
          <div role="tablist" aria-orientation="vertical" aria-label="Sidebar panels" className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-line bg-chrome py-2">
            {PANELS.map((p) => {
              const selected = panel === p.id;
              const joinCount = p.id === "joins" && discovery.status === "ready" ? discovery.relationships.length : 0;
              return (
                <button
                  key={p.id}
                  role="tab"
                  aria-selected={selected}
                  aria-label={p.label}
                  title={p.label}
                  onClick={() => showPanel(p.id)}
                  className={`relative flex size-8 items-center justify-center rounded-md transition-colors ${
                    selected ? "bg-surface text-ink ring-1 ring-line" : "text-muted hover:bg-sunken hover:text-ink"
                  }`}
                >
                  {selected && <span className="absolute -left-[5px] top-2 h-5 w-0.5 rounded-r bg-accent" />}
                  <Icon name={p.icon} size={16} />
                  {joinCount > 0 && (
                    <span className="absolute -right-0.5 top-0.5 min-w-[14px] rounded-full bg-join-soft px-1 text-center text-[10px] font-medium leading-[14px] tabular-nums text-join">
                      {joinCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex w-[264px] min-w-0 flex-col">
            {panel === "tables" && (
              <div className="flex min-h-0 flex-1 flex-col">
                <PanelHeader
                  title="Explorer"
                  count={
                    <>
                      {tables.length} {tables.length === 1 ? "table" : "tables"}
                      {views.length > 0 && `, ${views.length} ${views.length === 1 ? "view" : "views"}`}
                    </>
                  }
                >
                  <button onClick={() => setDialog("addFiles")} className={btn.icon} title="Add data" aria-label="Add data">
                    <Icon name="plus" size={15} />
                  </button>
                </PanelHeader>
                <SearchBox value={filter} onChange={setFilter} placeholder="Search tables and columns" label="Search tables and columns" />
                <div className="min-h-0 flex-1 overflow-y-auto pb-3">
                  {visibleTables.length > 0 && <SectionLabel label="Tables" count={visibleTables.length} />}
                  {visibleTables.map((t) => (
                    <TableSchema
                      key={t.name}
                      table={t}
                      filter={q}
                      keyColumns={keyColumns}
                      profileActive={visibleProfile === t.name}
                      onOpenProfile={() => setProfileTable(visibleProfile === t.name ? null : t.name)}
                    />
                  ))}
                  {visibleViews.length > 0 && <SectionLabel label="Views" count={visibleViews.length} />}
                  {visibleViews.map((v) => (
                    <TableSchema
                      key={`view:${v.name}`}
                      table={v}
                      isView
                      filter={q}
                      keyColumns={keyColumns}
                      profileActive={false}
                      onOpenProfile={() => undefined}
                    />
                  ))}
                  {tables.length === 0 && views.length === 0 && (
                    <p className="px-3 py-4 text-[13px] leading-5 text-muted">
                      No tables yet. Add data, or create one with SQL — <code className="font-mono text-[12px]">CREATE TABLE</code> results appear here.
                    </p>
                  )}
                  {q && visibleTables.length === 0 && visibleViews.length === 0 && (tables.length > 0 || views.length > 0) && (
                    <p className="px-3 py-4 text-[13px] text-muted">Nothing matches “{filter.trim()}”.</p>
                  )}
                </div>
              </div>
            )}
            {panel === "joins" && <RelationshipsPanel />}
            {panel === "history" && <HistoryPanel />}
            {panel === "snippets" && <SnippetsPanel />}
          </div>
        </aside>
        {visibleProfile && <ProfileDrawer tableName={visibleProfile} onClose={() => setProfileTable(null)} />}
      </div>
    </>
  );
}
