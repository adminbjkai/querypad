"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { TableInfo } from "@/types";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast } from "@/stores/ui-store";
import { insertAtCursor } from "@/lib/editor-bridge";
import { openTablePage, previewTable } from "@/lib/workspace-actions";
import { Icon } from "@/components/ui/icons";
import { Chip, HoverTray, KindGlyph, btn } from "@/components/ui/primitives";
import TableHoverCard, { PinIcon, isTouchOnly } from "./TableHoverCard";

interface TableSchemaProps {
  table: TableInfo;
  /** Views have no row count, profile, or file; removing one drops the view. */
  isView?: boolean;
  /** Lowercased search text; matching columns are listed and the table opens to show them. */
  filter?: string;
  keyColumns: Map<string, "key" | "ref">;
  profileActive: boolean;
  onOpenProfile: () => void;
  /** Pinned tables sit in their own group at the top of the explorer. */
  pinned?: boolean;
  onTogglePin?: () => void;
}

const HOVER_DELAY = 400;
const LEAVE_DELAY = 150;

function quoteIfNeeded(name: string): string {
  return /^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replaceAll('"', '""')}"`;
}

/** Wraps every occurrence of the (lowercased) search text in a `<mark>`. */
export function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(query); at !== -1; at = lower.indexOf(query, from)) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className="rounded-sm bg-accent-soft text-ink">
        {text.slice(at, at + query.length)}
      </mark>
    );
    from = at + query.length;
  }
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}

export default function TableSchema({ table, isView, filter = "", keyColumns, profileActive, onOpenProfile, pinned, onTogglePin }: TableSchemaProps) {
  const removeTable = useWorkspaceStore((s) => s.removeTable);
  const dropView = useWorkspaceStore((s) => s.dropView);
  const [expanded, setExpanded] = useState(!isView);

  const matchedColumns = filter ? table.columns.filter((c) => c.name.toLowerCase().includes(filter)) : [];
  const filtering = matchedColumns.length > 0;
  // A search keeps every match open so the matching columns are in view.
  const isExpanded = filter ? true : expanded;
  const columns = filtering ? matchedColumns : table.columns;

  const insert = (text: string) => {
    if (!insertAtCursor(text)) toast("Open the SQL editor to insert names.", "info");
  };

  // Hover card: opens after a short hover (mouse only) or on focus; closes on leave, blur or Escape.
  const rowRef = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState<DOMRect | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const clearTimers = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    openTimer.current = closeTimer.current = null;
  };
  const showCard = useCallback(() => {
    if (isTouchOnly() || !rowRef.current) return;
    setCard(rowRef.current.getBoundingClientRect());
  }, []);
  const closeCard = useCallback(() => {
    clearTimers();
    setCard(null);
  }, []);
  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setCard(null), LEAVE_DELAY);
  };
  const cancelClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  useEffect(() => clearTimers, []);

  return (
    <div className="qp-table-entry px-1.5 pt-1">
      <div
        ref={rowRef}
        onPointerEnter={(e) => {
          if (e.pointerType !== "mouse" || card) return;
          clearTimers();
          openTimer.current = window.setTimeout(showCard, HOVER_DELAY);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== "mouse") return;
          if (card) scheduleClose();
          else clearTimers();
        }}
        onBlur={(e) => {
          // Focus leaving the row (and its tray) closes the card; Tab into the tray keeps it.
          if (card && (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget))) scheduleClose();
        }}
        className="group relative flex h-7 items-center rounded-md transition-colors hover:bg-sunken"
      >
        <button
          onClick={() => setExpanded((v) => !v)}
          onFocus={showCard}
          aria-expanded={isExpanded}
          aria-label={table.name}
          className="flex h-7 min-w-0 flex-1 items-center gap-1.5 px-1.5 text-left"
        >
          <Icon name="chevronRight" size={14} className={`text-faint transition-transform ${isExpanded ? "rotate-90" : ""}`} />
          {pinned && <PinIcon size={12} className="text-accent" />}
          <span className="truncate font-mono text-[12px] font-medium text-ink">
            <Highlight text={table.name} query={filter} />
          </span>
          {filtering && (
            <Chip tone="accent" className="ml-1 tabular-nums">
              {matchedColumns.length} of {table.columns.length} {table.columns.length === 1 ? "column" : "columns"}
            </Chip>
          )}
          <span className="ml-auto shrink-0 pl-2 font-mono text-[11px] tabular-nums text-faint">
            {isView ? "view" : table.rowCount.toLocaleString()}
          </span>
        </button>
        <HoverTray className="qp-table-actions p-0!">
          <button onClick={() => openTablePage(table.name)} className={btn.iconSm} title="Open table page" aria-label={`Open ${table.name}`}>
            <Icon name="table" size={14} />
          </button>
          <button onClick={() => previewTable(table.name)} className={btn.iconSm} title="Preview rows in a new tab" aria-label={`Preview ${table.name}`}>
            <Icon name="play" size={14} />
          </button>
          {!isView && (
            <button
              onClick={onOpenProfile}
              className={`${btn.iconSm} ${profileActive ? "text-accent hover:text-accent" : ""}`}
              title="Quick profile beside the explorer"
              aria-label={`Profile ${table.name}`}
            >
              <Icon name="profile" size={14} />
            </button>
          )}
          {!isView && onTogglePin && (
            <button
              onClick={onTogglePin}
              className={`${btn.iconSm} ${pinned ? "text-accent hover:text-accent" : ""}`}
              title={pinned ? "Unpin from the top of the explorer" : "Pin to the top of the explorer"}
              aria-label={`${pinned ? "Unpin" : "Pin"} ${table.name}`}
              aria-pressed={pinned}
            >
              <PinIcon size={14} />
            </button>
          )}
          <button
            onClick={() => void (isView ? dropView(table.name) : removeTable(table.name))}
            className={`${btn.iconSm} hover:bg-danger-soft hover:text-danger`}
            title={isView ? "Drop view" : "Remove table"}
            aria-label={`Remove ${table.name}`}
          >
            <Icon name="x" size={14} />
          </button>
        </HoverTray>
      </div>
      {card && (
        <TableHoverCard
          table={table}
          isView={isView}
          anchor={card}
          keyColumns={keyColumns}
          onClose={closeCard}
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
        />
      )}
      {isExpanded && (
        <ul className="mb-1 ml-[15px] border-l border-line pl-1">
          {columns.map((col) => {
            const mark = keyColumns.get(`${table.name}.${col.name}`);
            return (
              <li key={col.name}>
                <button
                  onClick={() => insert(quoteIfNeeded(col.name))}
                  className="flex h-7 w-full items-center gap-1 rounded px-1 text-left transition-colors hover:bg-sunken"
                  title={`Insert ${col.name} — ${col.type}`}
                >
                  <KindGlyph type={col.type} />
                  <span className="truncate font-mono text-[12px] text-ink">
                    <Highlight text={col.name} query={filter} />
                  </span>
                  {mark && (
                    <Icon
                      name={mark === "key" ? "key" : "join"}
                      size={14}
                      className="shrink-0 text-join"
                      aria-label={mark === "key" ? "join key" : "references another table"}
                    />
                  )}
                  <span className="ml-auto shrink-0 truncate pl-2 text-right font-mono text-[11px] text-faint">{col.type.toLowerCase()}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
