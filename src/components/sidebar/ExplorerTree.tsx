"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { TableInfo } from "@/types";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast } from "@/stores/ui-store";
import { insertAtCursor } from "@/lib/editor-bridge";
import { openTablePage, previewTable } from "@/lib/workspace-actions";
import { Icon } from "@/components/ui/icons";
import { Chip, HoverTray, btn } from "@/components/ui/primitives";
import TableHoverCard, { PinIcon, isTouchOnly } from "./TableHoverCard";

const HOVER_DELAY = 400;
const LEAVE_DELAY = 150;

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

/** Insert a column name at the editor cursor (quoted when SQL needs it). */
export function insertColumnName(name: string): void {
  const text = /^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replaceAll('"', '""')}"`;
  if (!insertAtCursor(text)) toast("Open the SQL editor to insert names.", "info");
}

const indent = (level: number) => ({ paddingLeft: `${(level - 1) * 14 + 6}px` });
const ROW = "group relative flex h-7 items-center rounded-md transition-colors hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

interface ObjectRowProps {
  table: TableInfo;
  isView: boolean;
  level: number;
  query: string;
  matchedColumns: number;
  expanded: boolean | undefined;
  selected: boolean;
  tabbable: boolean;
  pinned: boolean;
  profileActive: boolean;
  keyColumns: Map<string, "key" | "ref">;
  onSelect: () => void;
  onOpen: () => void;
  onProfile: () => void;
  onTogglePin: () => void;
  onActive: () => void;
}

function ObjectRow({
  table,
  isView,
  level,
  query,
  matchedColumns,
  expanded,
  selected,
  tabbable,
  pinned,
  profileActive,
  keyColumns,
  onSelect,
  onOpen,
  onProfile,
  onTogglePin,
  onActive,
}: ObjectRowProps) {
  const removeTable = useWorkspaceStore((s) => s.removeTable);
  const dropView = useWorkspaceStore((s) => s.dropView);

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
    <>
      <div
        ref={rowRef}
        role="treeitem"
        aria-label={table.name}
        aria-level={level}
        aria-selected={selected}
        aria-expanded={expanded}
        tabIndex={tabbable ? 0 : -1}
        data-id={`obj:${isView ? "view" : "table"}:${table.name}`}
        data-kind="object"
        data-name={table.name}
        data-parent={isView ? "group:views" : "group:tables"}
        onFocus={() => {
          onActive();
          showCard();
        }}
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
        style={indent(level)}
        className={`${ROW} ${selected ? "bg-accent-soft ring-1 ring-accent hover:bg-accent-soft" : ""}`}
      >
        <button
          data-main
          tabIndex={-1}
          onClick={onSelect}
          onDoubleClick={onOpen}
          aria-label={table.name}
          className="flex h-7 min-w-0 flex-1 items-center gap-1.5 pr-1.5 text-left focus-visible:outline-none"
        >
          <Icon name={isView ? "code" : "table"} size={14} className={`shrink-0 ${selected ? "text-accent" : "text-muted"}`} />
          <span className="truncate font-mono text-[12px] font-medium text-ink">
            <Highlight text={table.name} query={query} />
          </span>
          {pinned && <PinIcon size={12} className="text-accent" aria-label="pinned" />}
          {matchedColumns > 0 && (
            <Chip tone="accent" className="ml-auto shrink-0 tabular-nums">
              {matchedColumns} of {table.columns.length} {table.columns.length === 1 ? "column" : "columns"}
            </Chip>
          )}
          {matchedColumns === 0 && (
            <span className="ml-auto shrink-0 pl-2 font-mono text-[11px] tabular-nums text-faint">
              {isView ? "view" : table.rowCount.toLocaleString()}
            </span>
          )}
        </button>
        <HoverTray className="qp-table-actions p-0!">
          <button onClick={onOpen} className={btn.iconSm} title="Open table page" aria-label={`Open ${table.name}`}>
            <Icon name="table" size={14} />
          </button>
          <button onClick={() => previewTable(table.name)} className={btn.iconSm} title="Preview rows in a new tab" aria-label={`Preview ${table.name}`}>
            <Icon name="play" size={14} />
          </button>
          {!isView && (
            <button
              onClick={onProfile}
              className={`${btn.iconSm} ${profileActive ? "text-accent hover:text-accent" : ""}`}
              title="Quick profile beside the explorer"
              aria-label={`Profile ${table.name}`}
            >
              <Icon name="profile" size={14} />
            </button>
          )}
          {!isView && (
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
    </>
  );
}

type Node =
  | { id: string; kind: "root"; level: 1; parent: null }
  | { id: string; kind: "group"; level: 2; parent: "root"; label: string; shown: number; total: number; open: boolean }
  | { id: string; kind: "object"; level: 3; parent: string; table: TableInfo; isView: boolean; matched: number; expanded: boolean | undefined }
  | { id: string; kind: "column"; level: 4; parent: string; table: string; column: TableInfo["columns"][number] };

interface ExplorerTreeProps {
  spaceName: string;
  /** Tables (pinned first) and views that pass the search and filters. */
  tables: TableInfo[];
  views: TableInfo[];
  totalTables: number;
  totalViews: number;
  /** Lowercased search text. */
  query: string;
  keyColumns: Map<string, "key" | "ref">;
  pins: string[];
  /** Ids of collapsed nodes: "root", "group:tables", "group:views". */
  collapsed: Set<string>;
  onToggleNode: (id: string) => void;
  selected: string | null;
  profileTable: string | null;
  onSelect: (name: string) => void;
  onProfile: (name: string) => void;
  onTogglePin: (name: string) => void;
}

/** The explorer: space → Tables / Views groups → objects (→ matching columns while searching). */
export default function ExplorerTree({
  spaceName,
  tables,
  views,
  totalTables,
  totalViews,
  query,
  keyColumns,
  pins,
  collapsed,
  onToggleNode,
  selected,
  profileTable,
  onSelect,
  onProfile,
  onTogglePin,
}: ExplorerTreeProps) {
  const treeRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const searching = query !== "";

  const nodes: Node[] = [{ id: "root", kind: "root", level: 1, parent: null }];
  if (!collapsed.has("root")) {
    const groups: { key: "tables" | "views"; label: string; items: TableInfo[]; total: number }[] = [
      { key: "tables", label: "Tables", items: tables, total: totalTables },
      { key: "views", label: "Views", items: views, total: totalViews },
    ];
    for (const g of groups) {
      if (g.items.length === 0) continue;
      const id = `group:${g.key}`;
      const open = searching || !collapsed.has(id);
      nodes.push({ id, kind: "group", level: 2, parent: "root", label: g.label, shown: g.items.length, total: g.total, open });
      if (!open) continue;
      for (const table of g.items) {
        const matches = searching ? table.columns.filter((c) => c.name.toLowerCase().includes(query)) : [];
        const objectId = `obj:${g.key === "views" ? "view" : "table"}:${table.name}`;
        nodes.push({ id: objectId, kind: "object", level: 3, parent: id, table, isView: g.key === "views", matched: matches.length, expanded: matches.length > 0 ? true : undefined });
        for (const column of matches) nodes.push({ id: `${objectId}:${column.name}`, kind: "column", level: 4, parent: objectId, table: table.name, column });
      }
    }
  }
  const tabbableId = nodes.some((n) => n.id === activeId) ? activeId : (nodes.find((n) => n.kind === "object")?.id ?? "root");

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const item = target.closest<HTMLElement>('[role="treeitem"]');
    // Keys on a row's tray buttons keep their normal meaning.
    if (!item || !(target === item || target.hasAttribute("data-main"))) return;
    const items = Array.from(treeRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []);
    const index = items.indexOf(item);
    const focusAt = (i: number) => items[Math.min(Math.max(i, 0), items.length - 1)]?.focus();
    const kind = item.dataset.kind;
    const id = item.dataset.id ?? "";
    const expanded = item.getAttribute("aria-expanded");
    let handled = true;
    switch (e.key) {
      case "ArrowDown":
        focusAt(index + 1);
        break;
      case "ArrowUp":
        focusAt(index - 1);
        break;
      case "Home":
        focusAt(0);
        break;
      case "End":
        focusAt(items.length - 1);
        break;
      case "ArrowRight":
        if (kind === "root" || kind === "group") {
          if (expanded === "false") onToggleNode(id);
          else focusAt(index + 1);
        } else if (kind === "object" && expanded === "true") focusAt(index + 1);
        break;
      case "ArrowLeft":
        if ((kind === "root" || kind === "group") && expanded === "true" && !(kind === "group" && searching)) onToggleNode(id);
        else if (item.dataset.parent) focusAt(items.findIndex((el) => el.dataset.id === item.dataset.parent));
        break;
      case "Enter":
        if (kind === "object") openTablePage(item.dataset.name ?? "");
        else if (kind === "column") insertColumnName(item.dataset.column ?? "");
        else if (!(kind === "group" && searching)) onToggleNode(id);
        break;
      case " ":
        if (kind === "object") onSelect(item.dataset.name ?? "");
        else if (kind === "column") insertColumnName(item.dataset.column ?? "");
        else if (!(kind === "group" && searching)) onToggleNode(id);
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  };

  const chevron = (open: boolean) => <Icon name="chevronRight" size={14} className={`shrink-0 text-faint transition-transform ${open ? "rotate-90" : ""}`} />;

  return (
    <div ref={treeRef} role="tree" aria-label="Tables and views" onKeyDown={onKeyDown} className="px-1.5 pb-3">
      {nodes.map((node) => {
        const tabIndex = node.id === tabbableId ? 0 : -1;
        if (node.kind === "root") {
          const open = !collapsed.has("root");
          return (
            <div
              key={node.id}
              role="treeitem"
              aria-level={1}
              aria-expanded={open}
              aria-selected={false}
              aria-label={spaceName}
              tabIndex={tabIndex}
              data-id="root"
              data-kind="root"
              onFocus={() => setActiveId(node.id)}
              onClick={() => onToggleNode("root")}
              style={indent(1)}
              className={`${ROW} cursor-pointer gap-1.5 pr-2`}
            >
              {chevron(open)}
              <Icon name="database" size={14} className="shrink-0 text-accent" />
              <span className="truncate text-[12px] font-semibold text-ink">{spaceName}</span>
            </div>
          );
        }
        if (node.kind === "group") {
          return (
            <div
              key={node.id}
              role="treeitem"
              aria-level={2}
              aria-expanded={node.open}
              aria-selected={false}
              aria-label={node.label}
              tabIndex={tabIndex}
              data-id={node.id}
              data-kind="group"
              data-parent="root"
              onFocus={() => setActiveId(node.id)}
              onClick={() => !searching && onToggleNode(node.id)}
              style={indent(2)}
              className={`${ROW} cursor-pointer gap-1.5 pr-2`}
            >
              {chevron(node.open)}
              <span className="text-[12px] font-medium text-muted">{node.label}</span>
              <Chip className="tabular-nums">{searching && node.shown !== node.total ? `${node.shown} of ${node.total}` : node.shown}</Chip>
            </div>
          );
        }
        if (node.kind === "object") {
          const name = node.table.name;
          return (
            <ObjectRow
              key={node.id}
              table={node.table}
              isView={node.isView}
              level={3}
              query={query}
              matchedColumns={node.matched}
              expanded={node.expanded}
              selected={selected === name}
              tabbable={tabIndex === 0}
              pinned={!node.isView && pins.includes(name)}
              profileActive={profileTable === name}
              keyColumns={keyColumns}
              onSelect={() => onSelect(name)}
              onOpen={() => openTablePage(name)}
              onProfile={() => onProfile(name)}
              onTogglePin={() => onTogglePin(name)}
              onActive={() => setActiveId(node.id)}
            />
          );
        }
        const mark = keyColumns.get(`${node.table}.${node.column.name}`);
        return (
          <div
            key={node.id}
            role="treeitem"
            aria-level={4}
            aria-selected={false}
            tabIndex={tabIndex}
            data-id={node.id}
            data-kind="column"
            data-column={node.column.name}
            data-parent={node.parent}
            onFocus={() => setActiveId(node.id)}
            style={indent(4)}
            className={ROW}
          >
            <button
              data-main
              tabIndex={-1}
              onClick={() => insertColumnName(node.column.name)}
              title={`Insert ${node.column.name} — ${node.column.type}`}
              className="flex h-7 min-w-0 flex-1 items-center gap-1.5 pr-1.5 text-left focus-visible:outline-none"
            >
              <span className="truncate font-mono text-[12px] text-ink">
                <Highlight text={node.column.name} query={query} />
              </span>
              {mark && (
                <Icon name={mark === "key" ? "key" : "join"} size={14} className="shrink-0 text-join" aria-label={mark === "key" ? "join key" : "references another table"} />
              )}
              <span className="ml-auto shrink-0 pl-2 font-mono text-[11px] uppercase text-faint">{node.column.type}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
