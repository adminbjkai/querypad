"use client";

import { useMemo } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore, type SidebarPanel } from "@/stores/ui-store";
import { relationshipKey } from "@/lib/discovery/relationships";
import TableSchema from "./TableSchema";
import ProfileDrawer from "./ProfileDrawer";
import RelationshipsPanel from "./RelationshipsPanel";
import HistoryPanel from "./HistoryPanel";
import { Icon } from "@/components/ui/icons";
import { btn } from "@/components/ui/primitives";

const PANELS: { id: SidebarPanel; label: string }[] = [
  { id: "tables", label: "Tables" },
  { id: "joins", label: "Joins" },
  { id: "history", label: "History" },
];

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

  const visibleProfile = profileTable && tables.some((t) => t.name === profileTable) ? profileTable : null;
  if (!open) return null;

  return (
    <>
      {/* Small screens: the sidebar floats over the workbench. */}
      <div className="fixed inset-0 top-12 z-30 bg-scrim md:hidden" onClick={() => setOpen(false)} />
      <div className="fixed bottom-0 left-0 top-12 z-30 flex md:static md:z-auto">
        <aside className="flex h-full w-[272px] flex-col border-r border-line bg-surface" aria-label="Workspace sidebar">
          <div className="flex items-center gap-1 border-b border-line px-2 py-1.5" role="tablist">
            {PANELS.map((p) => (
              <button
                key={p.id}
                role="tab"
                aria-selected={panel === p.id}
                onClick={() => showPanel(p.id)}
                className={`h-7 rounded-md px-2.5 text-[13px] transition-colors ${
                  panel === p.id ? "bg-sunken font-medium text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {p.label}
                {p.id === "joins" && discovery.status === "ready" && discovery.relationships.length > 0 && (
                  <span className="ml-1.5 text-[11px] text-join">{discovery.relationships.length}</span>
                )}
              </button>
            ))}
          </div>

          {panel === "tables" && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
                <p className="text-[12px] text-muted">
                  {tables.length} {tables.length === 1 ? "table" : "tables"}
                  {views.length > 0 && `, ${views.length} ${views.length === 1 ? "view" : "views"}`}
                </p>
                <button onClick={() => setDialog("addFiles")} className={btn.ghost}>
                  <Icon name="plus" size={14} />
                  Add data
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pb-3">
                {tables.map((t) => (
                  <TableSchema
                    key={t.name}
                    table={t}
                    keyColumns={keyColumns}
                    profileActive={visibleProfile === t.name}
                    onOpenProfile={() => setProfileTable(visibleProfile === t.name ? null : t.name)}
                  />
                ))}
                {views.map((v) => (
                  <TableSchema
                    key={`view:${v.name}`}
                    table={v}
                    isView
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
              </div>
            </div>
          )}
          {panel === "joins" && <RelationshipsPanel />}
          {panel === "history" && <HistoryPanel />}
        </aside>
        {visibleProfile && <ProfileDrawer tableName={visibleProfile} onClose={() => setProfileTable(null)} />}
      </div>
    </>
  );
}
