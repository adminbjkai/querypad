"use client";

import type { TableInfo } from "@/types";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast } from "@/stores/ui-store";
import { insertAtCursor } from "@/lib/editor-bridge";
import { quoteIdent } from "@/lib/duckdb/sql-utils";
import { copyTableName, openTablePage, previewTable } from "@/lib/workspace-actions";
import { Icon } from "@/components/ui/icons";
import { KindGlyph, Menu, btn } from "@/components/ui/primitives";
import { insertColumnName } from "./ExplorerTree";

/** Bottom pane of the explorer: the selected table or view with every column and its full type. */
export default function ObjectDetails({
  table,
  isView,
  keyColumns,
  onProfile,
  onClose,
}: {
  table: TableInfo;
  isView: boolean;
  keyColumns: Map<string, "key" | "ref">;
  onProfile: () => void;
  onClose: () => void;
}) {
  const removeTable = useWorkspaceStore((s) => s.removeTable);
  const dropView = useWorkspaceStore((s) => s.dropView);

  return (
    <section aria-label={`${table.name} details`} className="flex min-h-0 flex-1 flex-col bg-chrome">
      <div className="flex h-9 shrink-0 items-center gap-2 px-3">
        <h3 className="min-w-0 truncate font-mono text-[12px] font-semibold text-ink" title={table.name}>
          {table.name}
        </h3>
        <span className="shrink-0 text-[11px] tabular-nums text-faint">
          {isView ? "view" : `${table.rowCount.toLocaleString()} ${table.rowCount === 1 ? "row" : "rows"}`}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Menu
            label={`${table.name} actions`}
            items={[
              { label: "Open table page", icon: "table", onSelect: () => openTablePage(table.name) },
              { label: "Preview rows", icon: "play", onSelect: () => previewTable(table.name) },
              ...(isView ? [] : [{ label: "Profile", icon: "profile" as const, onSelect: onProfile }]),
              "divider",
              { label: "Copy name", icon: "copy", onSelect: () => void copyTableName(table.name) },
              {
                label: "Insert name",
                icon: "insert",
                onSelect: () => {
                  if (!insertAtCursor(quoteIdent(table.name))) toast("Open the SQL editor to insert names.", "info");
                },
              },
              "divider",
              {
                label: isView ? "Drop view" : "Remove table",
                icon: "trash",
                danger: true,
                onSelect: () => void (isView ? dropView(table.name) : removeTable(table.name)),
              },
            ]}
            trigger={({ toggle }) => (
              <button onClick={toggle} className={btn.iconSm} aria-haspopup="menu" aria-label={`${table.name} actions`} title="More actions">
                <Icon name="more" size={14} />
              </button>
            )}
          />
          <button onClick={onClose} className={btn.iconSm} aria-label="Close details" title="Close details">
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {table.columns.map((col) => {
          const mark = keyColumns.get(`${table.name}.${col.name}`);
          return (
            <li key={col.name}>
              <button
                onClick={() => insertColumnName(col.name)}
                className="flex h-6 w-full items-center gap-1.5 rounded px-1.5 text-left transition-colors hover:bg-sunken"
                title={`Insert ${col.name} — ${col.type}`}
              >
                <KindGlyph type={col.type} />
                <span className="truncate font-mono text-[12px] text-ink">{col.name}</span>
                {mark && (
                  <Icon
                    name={mark === "key" ? "key" : "join"}
                    size={14}
                    className="shrink-0 text-join"
                    aria-label={mark === "key" ? "join key" : "references another table"}
                  />
                )}
                <span className="ml-auto shrink-0 truncate pl-2 text-right font-mono text-[11px] uppercase text-faint">{col.type}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
