"use client";

import { useState } from "react";
import type { TableInfo } from "@/types";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast } from "@/stores/ui-store";
import { insertAtCursor } from "@/lib/editor-bridge";
import { previewTable } from "@/lib/workspace-actions";
import { Icon } from "@/components/ui/icons";
import { KindGlyph } from "@/components/ui/primitives";

interface TableSchemaProps {
  table: TableInfo;
  keyColumns: Map<string, "key" | "ref">;
  profileActive: boolean;
  onOpenProfile: () => void;
}

function quoteIfNeeded(name: string): string {
  return /^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replaceAll('"', '""')}"`;
}

export default function TableSchema({ table, keyColumns, profileActive, onOpenProfile }: TableSchemaProps) {
  const removeTable = useWorkspaceStore((s) => s.removeTable);
  const [expanded, setExpanded] = useState(true);

  const insert = (text: string) => {
    if (!insertAtCursor(text)) toast("Open the SQL editor to insert names.", "info");
  };

  return (
    <div className="group/table px-1.5 pt-1">
      <div className="flex items-center rounded-md hover:bg-raised">
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={table.name}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1.5 text-left"
        >
          <Icon name="chevronRight" size={13} className={`text-faint transition-transform ${expanded ? "rotate-90" : ""}`} />
          <span className="truncate font-mono text-[13px] font-medium text-ink">{table.name}</span>
          <span className="ml-auto shrink-0 pl-2 text-[11px] tabular-nums text-faint">{table.rowCount.toLocaleString()}</span>
        </button>
        <div className="flex shrink-0 pr-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/table:opacity-100">
          <button onClick={() => previewTable(table.name)} className="rounded p-1 text-muted hover:bg-sunken hover:text-ink" title="Preview rows in a new tab" aria-label={`Preview ${table.name}`}>
            <Icon name="play" size={13} />
          </button>
          <button
            onClick={onOpenProfile}
            className={`rounded p-1 hover:bg-sunken ${profileActive ? "text-accent" : "text-muted hover:text-ink"}`}
            title="Profile columns"
            aria-label={`Profile ${table.name}`}
          >
            <Icon name="profile" size={13} />
          </button>
          <button onClick={() => void removeTable(table.name)} className="rounded p-1 text-muted hover:bg-danger-soft hover:text-danger" title="Remove table" aria-label={`Remove ${table.name}`}>
            <Icon name="x" size={13} />
          </button>
        </div>
      </div>
      {expanded && (
        <ul className="mb-1 ml-[18px] border-l border-line pl-1.5">
          {table.columns.map((col) => {
            const mark = keyColumns.get(`${table.name}.${col.name}`);
            return (
              <li key={col.name}>
                <button
                  onClick={() => insert(quoteIfNeeded(col.name))}
                  className="flex w-full items-center gap-1 rounded px-1 py-[3px] text-left hover:bg-raised"
                  title={`Insert ${col.name} — ${col.type}`}
                >
                  <KindGlyph type={col.type} />
                  <span className="truncate font-mono text-[12px] text-ink">{col.name}</span>
                  {mark && (
                    <Icon
                      name={mark === "key" ? "key" : "join"}
                      size={12}
                      className="text-join"
                      aria-label={mark === "key" ? "join key" : "references another table"}
                    />
                  )}
                  <span className="ml-auto shrink-0 truncate pl-2 text-[11px] text-faint">{col.type.toLowerCase()}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
