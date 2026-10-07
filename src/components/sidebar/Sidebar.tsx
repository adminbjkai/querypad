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
import { Icon } from "@/components/ui/icons";
import { SectionLabel, btn } from "@/components/ui/primitives";

const PANEL_LABEL: Record<SidebarPanel, string> = { tables: "Tables", joins: "Joins", history: "History", snippets: "Snippets" };

/** A table or view is listed when its name or any column name contains the (lowercased) filter. */
function matchesFilter(table: TableInfo, q: string): boolean {
  return !q || table.name.toLowerCase().includes(q) || table.columns.some((c) => c.name.toLowerCase().includes(q));
}

export default function Sidebar() {
  const tables = useWorkspaceStore((s) => s.tables);
  const views = useWorkspaceStore((s) => s.views);
  const discovery = useWorkspaceStore((s) => s.discovery);
  const verdicts = useWorkspaceStore((s) => s.relationshipVerdicts);
  const open = useUiStore((s) => s.sidebarOpen);
  const panel = useUiStore((s) => s.sidebarPanel);
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
      {/* Small screens: the panel floats over the work area, beside the icon rail. */}
      <div className="fixed inset-0 left-[52px] z-30 bg-scrim md:hidden" onClick={() => setOpen(false)} />
      <div className="fixed bottom-6 left-[52px] top-0 z-30 flex md:static md:z-auto">
        <aside className="qp-slide-in flex h-full border-r border-line bg-chrome" aria-label={`${PANEL_LABEL[panel]} panel`}>
          <div className="flex w-[264px] min-w-0 flex-col bg-chrome">
            {panel === "tables" && (
              <div className="flex min-h-0 flex-1 flex-col">
                <PanelHeader
                  title="Tables"
                  count={
                    tables.length + views.length > 0 ? (
                      <>
                        {tables.length} {tables.length === 1 ? "table" : "tables"}
                        {views.length > 0 && `, ${views.length} ${views.length === 1 ? "view" : "views"}`}
                      </>
                    ) : undefined
                  }
                >
                  {/* The empty state carries the primary "Add data" action, so the header keeps one accessible name per page. */}
                  {tables.length + views.length > 0 && (
                    <button onClick={() => setDialog("addFiles")} className={btn.icon} title="Add data" aria-label="Add data">
                      <Icon name="plus" size={16} />
                    </button>
                  )}
                </PanelHeader>
                <SearchBox value={filter} onChange={setFilter} placeholder="Search tables and columns" label="Search tables and columns" />
                <div className="min-h-0 flex-1 overflow-y-auto pb-3">
                  {visibleTables.length > 0 && <SectionLabel as="div" className="px-3 pb-1 pt-3" count={visibleTables.length}>Tables</SectionLabel>}
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
                  {visibleViews.length > 0 && <SectionLabel as="div" className="px-3 pb-1 pt-3" count={visibleViews.length}>Views</SectionLabel>}
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
                    <div className="flex flex-col items-center px-4 py-10 text-center">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-raised text-muted">
                        <Icon name="table" size={18} />
                      </span>
                      <p className="mt-3 text-[14px] font-medium text-ink">No tables yet</p>
                      <p className="mt-1 text-[13px] leading-5 text-muted">
                        Add files or create one with <code className="font-mono text-[12px]">CREATE TABLE</code>.
                      </p>
                      <button onClick={() => setDialog("addFiles")} className={`${btn.primary} mt-4`}>
                        <Icon name="upload" size={16} />
                        Add data
                      </button>
                    </div>
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
