"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { QueryResult } from "@/types";
import { formatValue } from "@/lib/utils";
import { classifyType } from "@/lib/duckdb/sql-utils";
import { copyText } from "@/lib/export/clipboard";
import { toast } from "@/stores/ui-store";
import { Icon, type IconName } from "@/components/ui/icons";
import { KindGlyph } from "@/components/ui/primitives";

const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 32;
const NUM_COL = 56;
const MIN_COL = 48;
const MAX_COL = 640;

type Sort = { column: string; dir: "asc" | "desc" } | null;
type Cell = { row: number; col: number };

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1; // nulls last
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/**
 * Estimate a column width: the header needs room for the kind glyph, sort icon and menu chevron
 * (~7.3px/char of UI text), values are 12px monospace (~7.3px/char).
 */
function widthFor(name: string, rows: Record<string, unknown>[], sample: number, cap: number): number {
  const header = name.length * 7.3 + 72;
  let chars = 0;
  for (let i = 0; i < Math.min(rows.length, sample); i++) {
    chars = Math.max(chars, Math.min(120, formatValue(rows[i][name]).length));
  }
  return Math.round(Math.min(cap, Math.max(MIN_COL + 36, header, chars * 7.3 + 24)));
}

const cellText = (value: unknown) => (value === null || value === undefined ? "" : formatValue(value));
const short = (text: string) => (text.length > 40 ? `${text.slice(0, 40)}…` : text);

interface MenuState {
  column: string;
  x: number;
  y: number;
}

/** Fixed-position menu so it is never clipped by the scrolling grid. */
function ColumnMenu({
  state,
  items,
  onClose,
}: {
  state: MenuState;
  items: { label: string; icon: IconName; onSelect: () => void }[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element).closest("[data-column-menu]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const width = 200;
  const left = Math.max(8, Math.min(state.x, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(state.y, window.innerHeight - items.length * 32 - 16));

  return (
    <div
      data-column-menu
      role="menu"
      aria-label={`Column ${state.column}`}
      className="qp-pop fixed z-50 rounded-lg border border-line bg-surface p-1 shadow-pop"
      style={{ left, top, width }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-ink hover:bg-raised"
        >
          <Icon name={item.icon} className="text-muted" />
          <span className="flex-1">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export default function DataTable({
  result,
  filter = "",
  inspectedColumn = null,
  onInspect,
  onSelectColumn,
}: {
  result: QueryResult;
  filter?: string;
  /** Column currently shown in the inspector (highlighted in the header). */
  inspectedColumn?: string | null;
  onInspect?: (column: string) => void;
  /** Called when a cell is selected, so the inspector can follow the selection. */
  onSelectColumn?: (column: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [sort, setSort] = useState<Sort>(null);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [sel, setSel] = useState<Cell | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const kinds = useMemo(
    () => result.columns.map((_, i) => classifyType(result.columnTypes[i] ?? "")),
    [result]
  );
  const autoWidths = useMemo(() => result.columns.map((c) => widthFor(c, result.rows, 60, 380)), [result]);
  const widths = result.columns.map((c, i) => overrides[c] ?? autoWidths[i]);
  const gridCols = `${NUM_COL}px ${widths.map((w) => `${w}px`).join(" ")}`;
  const totalWidth = NUM_COL + widths.reduce((a, b) => a + b, 0);

  const rows = useMemo(() => {
    let out = result.rows;
    const needle = filter.trim().toLowerCase();
    if (needle) {
      out = out.filter((row) =>
        result.columns.some((c) => formatValue(row[c]).toLowerCase().includes(needle))
      );
    }
    if (sort) {
      const factor = sort.dir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) => {
        const av = a[sort.column];
        const bv = b[sort.column];
        // Keep NULLs at the bottom in both directions.
        if (av === null || av === undefined || bv === null || bv === undefined) return compare(av, bv);
        return compare(av, bv) * factor;
      });
    }
    return out;
  }, [result, filter, sort]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
    scrollMargin: HEADER_HEIGHT,
    scrollPaddingStart: HEADER_HEIGHT,
  });

  const cycleSort = (column: string) =>
    setSort((s) =>
      s?.column !== column ? { column, dir: "asc" } : s.dir === "asc" ? { column, dir: "desc" } : null
    );

  const copyCell = (cell: Cell) => {
    const text = cellText(rows[cell.row]?.[result.columns[cell.col]]);
    void copyText(text).then(() => toast(text === "" ? "Copied empty value" : `Copied ${short(text)}`));
  };

  const copyColumnValues = (column: string) => {
    const text = rows.map((r) => cellText(r[column])).join("\n");
    void copyText(text).then(() => toast(`Copied ${rows.length.toLocaleString()} values from ${column}`));
  };

  const copyColumnName = (column: string) => void copyText(column).then(() => toast(`Copied ${column}`));

  const select = (cell: Cell) => {
    setSel(cell);
    onSelectColumn?.(result.columns[cell.col]);
  };

  const ensureColVisible = (col: number) => {
    const el = parentRef.current;
    if (!el) return;
    let left = NUM_COL;
    for (let i = 0; i < col; i++) left += widths[i];
    const right = left + widths[col];
    if (left - NUM_COL < el.scrollLeft) el.scrollLeft = left - NUM_COL;
    else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) return;
    const meta = e.ctrlKey || e.metaKey;
    if (meta && e.key.toLowerCase() === "c") {
      if (sel) {
        e.preventDefault();
        copyCell(sel);
      }
      return;
    }
    if (e.key === "Escape") {
      setSel(null);
      return;
    }
    const lastRow = rows.length - 1;
    const lastCol = result.columns.length - 1;
    const page = Math.max(1, Math.floor(((parentRef.current?.clientHeight ?? 300) - HEADER_HEIGHT) / ROW_HEIGHT) - 1);
    const cur = sel ?? { row: 0, col: 0 };
    let next: Cell | null = null;
    switch (e.key) {
      case "ArrowDown": next = { ...cur, row: Math.min(lastRow, sel ? cur.row + 1 : 0) }; break;
      case "ArrowUp": next = { ...cur, row: Math.max(0, cur.row - 1) }; break;
      case "ArrowRight": next = { ...cur, col: Math.min(lastCol, sel ? cur.col + 1 : 0) }; break;
      case "ArrowLeft": next = { ...cur, col: Math.max(0, cur.col - 1) }; break;
      case "PageDown": next = { ...cur, row: Math.min(lastRow, cur.row + page) }; break;
      case "PageUp": next = { ...cur, row: Math.max(0, cur.row - page) }; break;
      case "Home": next = { row: meta ? 0 : cur.row, col: 0 }; break;
      case "End": next = { row: meta ? lastRow : cur.row, col: lastCol }; break;
      default: return;
    }
    e.preventDefault();
    select(next);
    virtualizer.scrollToIndex(next.row);
    ensureColVisible(next.col);
  };

  const startResize = (e: React.PointerEvent<HTMLSpanElement>, column: string, startWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    const startX = e.clientX;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) =>
      setOverrides((o) => ({ ...o, [column]: Math.min(MAX_COL, Math.max(MIN_COL, Math.round(startWidth + ev.clientX - startX))) }));
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const autoFit = (column: string) =>
    setOverrides((o) => ({ ...o, [column]: widthFor(column, result.rows, 1000, MAX_COL) }));

  if (result.columns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-surface p-6 text-[13px] text-muted">
        The statement ran and returned no columns.
      </div>
    );
  }

  const menuItems = (column: string) => [
    { label: "Sort ascending", icon: "sortAsc" as const, onSelect: () => setSort({ column, dir: "asc" }) },
    { label: "Sort descending", icon: "sortDesc" as const, onSelect: () => setSort({ column, dir: "desc" }) },
    ...(sort?.column === column ? [{ label: "Clear sort", icon: "x" as const, onSelect: () => setSort(null) }] : []),
    { label: "Copy column name", icon: "copy" as const, onSelect: () => copyColumnName(column) },
    { label: "Copy column values", icon: "copy" as const, onSelect: () => copyColumnValues(column) },
    ...(onInspect ? [{ label: "Inspect column", icon: "panelRight" as const, onSelect: () => onInspect(column) }] : []),
  ];

  return (
    <div
      ref={parentRef}
      className="group/grid h-full overflow-auto bg-surface outline-none"
      role="grid"
      aria-rowcount={rows.length}
      aria-colcount={result.columns.length}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div style={{ width: totalWidth, minWidth: "100%" }}>
        <div
          className="sticky top-0 z-10 grid border-b border-line bg-raised"
          style={{ gridTemplateColumns: gridCols, height: HEADER_HEIGHT }}
          role="row"
        >
          <div
            className="sticky left-0 z-[2] flex items-center justify-end border-r border-line bg-raised px-3 text-[11px] text-faint"
            role="columnheader"
          >
            #
          </div>
          {result.columns.map((col, i) => {
            const active = sort?.column === col;
            const inspected = inspectedColumn === col;
            return (
              <div
                key={col}
                role="columnheader"
                tabIndex={0}
                aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                onClick={(e) => (e.altKey && onInspect ? onInspect(col) : cycleSort(col))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    cycleSort(col);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ column: col, x: e.clientX, y: e.clientY });
                }}
                title={`${col} — ${result.columnTypes[i]}. Click to sort, Alt-click to inspect.`}
                className={`group relative flex min-w-0 cursor-pointer select-none items-center gap-0.5 border-r border-line/60 px-2 text-[12px] font-medium hover:bg-sunken ${
                  active ? "text-accent" : "text-ink"
                } ${inspected ? "shadow-[inset_0_-2px_0_var(--accent)]" : ""}`}
              >
                <KindGlyph kind={kinds[i]} type={result.columnTypes[i]} />
                <span className={`min-w-0 flex-1 truncate ${kinds[i] === "numeric" ? "text-right" : ""}`}>{col}</span>
                <Icon
                  name={active ? (sort!.dir === "asc" ? "sortAsc" : "sortDesc") : "sort"}
                  size={12}
                  className={active ? "" : "text-faint opacity-0 group-hover:opacity-100"}
                />
                <button
                  tabIndex={-1}
                  aria-label={`Menu for ${col}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    setMenu({ column: col, x: r.right - 200, y: r.bottom + 4 });
                  }}
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded text-faint opacity-0 hover:bg-line hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Icon name="chevronDown" size={12} />
                </button>
                <span
                  aria-hidden="true"
                  title="Drag to resize, double-click to fit"
                  onPointerDown={(e) => startResize(e, col, widths[i])}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    autoFit(col);
                  }}
                  className="qp-col-resize absolute inset-y-0 -right-0.5 z-[3] w-2 cursor-col-resize"
                />
              </div>
            );
          })}
        </div>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            const odd = item.index % 2 === 1;
            return (
              <div
                key={item.key}
                role="row"
                className={`group/row absolute left-0 grid w-full border-b border-line/40 hover:bg-sunken ${odd ? "bg-raised" : "bg-surface"}`}
                style={{
                  height: item.size,
                  transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
                  gridTemplateColumns: gridCols,
                }}
              >
                <div
                  className={`sticky left-0 z-[1] flex items-center justify-end border-r border-line px-3 font-mono text-[11px] tabular-nums text-faint group-hover/row:bg-sunken ${
                    odd ? "bg-raised" : "bg-surface"
                  } ${sel?.row === item.index ? "text-accent" : ""}`}
                >
                  {item.index + 1}
                </div>
                {result.columns.map((col, i) => {
                  const value = row[col];
                  const isNull = value === null || value === undefined;
                  const text = formatValue(value);
                  const selected = sel?.row === item.index && sel.col === i;
                  return (
                    <div
                      key={col}
                      role="gridcell"
                      aria-selected={selected}
                      onClick={() => select({ row: item.index, col: i })}
                      onDoubleClick={() => copyCell({ row: item.index, col: i })}
                      title={isNull ? "NULL" : text.length > 500 ? `${text.slice(0, 500)}…` : text}
                      className={`flex min-w-0 items-center border-r border-line/40 px-2 font-mono text-[12px] tabular-nums ${
                        kinds[i] === "numeric" ? "justify-end" : ""
                      } ${selected ? "ring-2 ring-inset ring-line-strong group-focus/grid:ring-accent" : ""} ${
                        isNull ? "" : "text-ink"
                      }`}
                    >
                      {isNull ? (
                        <span className="rounded bg-sunken px-1 font-sans text-[10px] font-medium italic leading-4 text-faint">NULL</span>
                      ) : text === "" ? (
                        <span className="text-faint">&quot;&quot;</span>
                      ) : (
                        <span className="truncate">{text}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {rows.length === 0 && (
          <p className="px-4 py-6 text-[13px] text-muted">
            {filter ? `No rows contain “${filter}”.` : "The query returned no rows."}
          </p>
        )}
      </div>
      {menu && <ColumnMenu state={menu} items={menuItems(menu.column)} onClose={() => setMenu(null)} />}
    </div>
  );
}
