"use client";

import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { QueryResult } from "@/types";
import { formatValue } from "@/lib/utils";
import { classifyType } from "@/lib/duckdb/sql-utils";
import { copyText } from "@/lib/export/clipboard";
import { toast } from "@/stores/ui-store";
import { Icon, type IconName } from "@/components/ui/icons";
import { Kbd, KindGlyph, MOD } from "@/components/ui/primitives";
import ColumnMiniChart, { DIST_HEIGHT } from "./ColumnMiniChart";
import { computeRangeStats, formatNumber, rangeToTsv } from "./range-stats";
import { sortRows, type SortState } from "./sort";

const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 32;
const FOOTER_HEIGHT = 28;
const NUM_COL = 56;
const MIN_COL = 48;
const MAX_COL = 640;

type Cell = { row: number; col: number };
/** A rectangular selection; `mode` records how it was made (whole rows/columns copy differently). */
type Sel = { anchor: Cell; focus: Cell; mode: "cell" | "row" | "col" | "all" };

/**
 * Estimate a column width: the header needs room for the kind glyph, sort icon and menu chevron
 * (~7.3px/char of UI text), values are 12px monospace (~7.3px/char).
 */
function widthFor(name: string, rows: Record<string, unknown>[], sample: number, cap: number): number {
  const header = name.length * 7.6 + 92;
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

/**
 * Memoized: the panel re-renders on every store change (the editor's text lives in the same tab record),
 * so callers must pass stable callbacks for the grid to skip those renders.
 */
export default memo(function DataTable({
  result,
  filter = "",
  inspectedColumn = null,
  showStats = false,
  onToggleStats,
  onInspect,
  onOpenCard,
  onSelectColumn,
  sort: sortProp,
  onSortChange,
}: {
  result: QueryResult;
  filter?: string;
  /** Column currently shown in the inspector (highlighted in the header). */
  inspectedColumn?: string | null;
  /** Show the mini-distribution and stats block under each column header. */
  showStats?: boolean;
  /** Hosted in the row-number header; when absent the toggle is not rendered. */
  onToggleStats?: () => void;
  onInspect?: (column: string) => void;
  /** Click on a header's stats block: opens the column card anchored to it (falls back to `onInspect`). */
  onOpenCard?: (column: string, anchor: HTMLElement) => void;
  /** Called when a cell is selected, so the inspector can follow the selection. */
  onSelectColumn?: (column: string) => void;
  /** Controlled sort (with `onSortChange`); when absent the grid keeps its own. */
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [localSort, setLocalSort] = useState<SortState>(null);
  const sort = sortProp !== undefined ? sortProp : localSort;
  const setSort = (next: SortState | ((prev: SortState) => SortState)) => {
    const value = typeof next === "function" ? next(sort) : next;
    if (onSortChange) onSortChange(value);
    else setLocalSort(value);
  };
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [sel, setSel] = useState<Sel | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const deferredFilter = useDeferredValue(filter);
  const filterUpdating = deferredFilter !== filter;

  const kinds = useMemo(
    () => result.columns.map((_, i) => classifyType(result.columnTypes[i] ?? "")),
    [result]
  );
  const autoWidths = useMemo(() => result.columns.map((c) => widthFor(c, result.rows, 60, 380)), [result]);
  const widths = result.columns.map((c, i) => overrides[c] ?? autoWidths[i]);
  const gridCols = `${NUM_COL}px ${widths.map((w) => `${w}px`).join(" ")}`;
  const totalWidth = NUM_COL + widths.reduce((a, b) => a + b, 0);

  const headerHeight = HEADER_HEIGHT + (showStats ? DIST_HEIGHT : 0);

  const rows = useMemo(() => {
    let out = result.rows;
    const needle = deferredFilter.trim().toLowerCase();
    if (needle) {
      out = out.filter((row) =>
        result.columns.some((c) => formatValue(row[c]).toLowerCase().includes(needle))
      );
    }
    if (sort) out = sortRows(out, sort.column, sort.dir, kinds[result.columns.indexOf(sort.column)] ?? "other");
    return out;
  }, [result, deferredFilter, sort, kinds]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
    scrollMargin: headerHeight,
    scrollPaddingStart: headerHeight,
  });

  const cycleSort = (column: string) =>
    setSort((s) =>
      s?.column !== column ? { column, dir: "asc" } : s.dir === "asc" ? { column, dir: "desc" } : null
    );

  const lastRow = rows.length - 1;
  const lastCol = result.columns.length - 1;

  // Normalised, clamped rectangle (rows can shrink under a selection when the filter changes).
  const range = useMemo(() => {
    if (!sel || lastRow < 0) return null;
    const cl = (n: number, max: number) => Math.max(0, Math.min(max, n));
    const ar = cl(sel.anchor.row, lastRow), fr = cl(sel.focus.row, lastRow);
    const ac = cl(sel.anchor.col, lastCol), fc = cl(sel.focus.col, lastCol);
    return {
      r1: Math.min(ar, fr), r2: Math.max(ar, fr), c1: Math.min(ac, fc), c2: Math.max(ac, fc),
      focus: { row: fr, col: fc }, mode: sel.mode,
    };
  }, [sel, lastRow, lastCol]);

  // Aggregates are only computed when a range exists, and deferred so dragging stays responsive.
  const deferredRange = useDeferredValue(range);
  const rangeStats = useMemo(
    () =>
      deferredRange
        ? computeRangeStats(rows, result.columns, deferredRange.r1, deferredRange.r2, deferredRange.c1, deferredRange.c2)
        : null,
    [deferredRange, rows, result.columns]
  );

  const copyRange = () => {
    if (!range) return;
    const { r1, r2, c1, c2, mode } = range;
    const single = r1 === r2 && c1 === c2;
    const text = single
      ? cellText(rows[r1]?.[result.columns[c1]])
      : rangeToTsv(rows, result.columns, r1, r2, c1, c2, mode === "col" || mode === "all");
    const n = (r2 - r1 + 1) * (c2 - c1 + 1);
    void copyText(text).then(() =>
      toast(single ? (text === "" ? "Copied empty value" : `Copied ${short(text)}`) : `Copied ${n.toLocaleString()} cells`)
    );
  };

  const copyColumnValues = (column: string) => {
    const text = rows.map((r) => cellText(r[column])).join("\n");
    void copyText(text).then(() => toast(`Copied ${rows.length.toLocaleString()} values from ${column}`));
  };

  const copyColumnName = (column: string) => void copyText(column).then(() => toast(`Copied ${column}`));

  const notify = (col: number) => onSelectColumn?.(result.columns[col]);

  /** Select (or, with `extend`, grow the selection to) a cell. */
  const selectCell = (cell: Cell, extend = false) => {
    setSel((s) => (extend && s ? { ...s, focus: cell, mode: "cell" } : { anchor: cell, focus: cell, mode: "cell" }));
    notify(cell.col);
  };
  const selectRow = (row: number, extend: boolean) => {
    if (lastCol < 0) return;
    setSel((s) =>
      extend && s ? { anchor: { row: s.anchor.row, col: 0 }, focus: { row, col: lastCol }, mode: "row" } : { anchor: { row, col: 0 }, focus: { row, col: lastCol }, mode: "row" }
    );
  };
  const selectColumn = (col: number, extend: boolean) => {
    setSel((s) =>
      extend && s ? { anchor: { row: 0, col: s.anchor.col }, focus: { row: lastRow, col }, mode: "col" } : { anchor: { row: 0, col }, focus: { row: lastRow, col }, mode: "col" }
    );
    notify(col);
  };
  const selectAll = () => {
    if (lastRow < 0) return;
    setSel({ anchor: { row: 0, col: 0 }, focus: { row: lastRow, col: lastCol }, mode: "all" });
  };

  /** Mouse-down on a cell starts a drag selection; moving over other cells grows the range. */
  const startDrag = (e: React.MouseEvent, cell: Cell) => {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection while dragging
    parentRef.current?.focus({ preventScroll: true });
    selectCell(cell, e.shiftKey);
    const move = (ev: MouseEvent) => {
      const el = parentRef.current;
      if (el) {
        const b = el.getBoundingClientRect();
        if (ev.clientY > b.bottom - 24) el.scrollTop += 24;
        else if (ev.clientY < b.top + headerHeight + 16) el.scrollTop -= 24;
        if (ev.clientX > b.right - 24) el.scrollLeft += 24;
        else if (ev.clientX < b.left + NUM_COL + 16) el.scrollLeft -= 24;
      }
      const hit = (document.elementFromPoint(ev.clientX, ev.clientY) as Element | null)?.closest<HTMLElement>("[data-r]");
      if (!hit) return;
      const next = { row: Number(hit.dataset.r), col: Number(hit.dataset.c) };
      setSel((s) => (s && (s.focus.row !== next.row || s.focus.col !== next.col) ? { ...s, focus: next, mode: "cell" } : s));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
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
    const key = e.key.toLowerCase();
    if (meta && key === "c") {
      if (range) {
        e.preventDefault();
        copyRange();
      }
      return;
    }
    if (meta && key === "a") {
      e.preventDefault();
      selectAll();
      return;
    }
    if (e.key === "Escape") {
      setSel(null);
      return;
    }
    const page = Math.max(1, Math.floor(((parentRef.current?.clientHeight ?? 300) - headerHeight - FOOTER_HEIGHT) / ROW_HEIGHT) - 1);
    const cur = range?.focus ?? { row: 0, col: 0 };
    const has = !!range;
    let next: Cell;
    switch (e.key) {
      case "ArrowDown": next = { ...cur, row: Math.min(lastRow, has ? cur.row + 1 : 0) }; break;
      case "ArrowUp": next = { ...cur, row: Math.max(0, cur.row - 1) }; break;
      case "ArrowRight": next = { ...cur, col: Math.min(lastCol, has ? cur.col + 1 : 0) }; break;
      case "ArrowLeft": next = { ...cur, col: Math.max(0, cur.col - 1) }; break;
      case "PageDown": next = { ...cur, row: Math.min(lastRow, cur.row + page) }; break;
      case "PageUp": next = { ...cur, row: Math.max(0, cur.row - page) }; break;
      case "Home": next = { row: meta ? 0 : cur.row, col: 0 }; break;
      case "End": next = { row: meta ? lastRow : cur.row, col: lastCol }; break;
      default: return;
    }
    e.preventDefault();
    selectCell(next, e.shiftKey && has);
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

  const cellInRange = (r: number, c: number) => !!range && r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;

  if (result.columns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-surface p-6 text-[13px] text-muted">
        The statement ran and returned no columns.
      </div>
    );
  }

  const menuItems = (column: string) => [
    { label: "Copy column name", icon: "copy" as const, onSelect: () => copyColumnName(column) },
    ...(onToggleStats
      ? [{ label: showStats ? "Hide column stats" : "Show column stats", icon: "profile" as const, onSelect: onToggleStats }]
      : []),
    { label: "Sort ascending", icon: "sortAsc" as const, onSelect: () => setSort({ column, dir: "asc" }) },
    { label: "Sort descending", icon: "sortDesc" as const, onSelect: () => setSort({ column, dir: "desc" }) },
    ...(sort?.column === column ? [{ label: "Clear sort", icon: "x" as const, onSelect: () => setSort(null) }] : []),
    { label: "Select column", icon: "table" as const, onSelect: () => selectColumn(result.columns.indexOf(column), false) },
    { label: "Copy column values", icon: "copy" as const, onSelect: () => copyColumnValues(column) },
    ...(onInspect ? [{ label: "Inspect column", icon: "panelRight" as const, onSelect: () => onInspect(column) }] : []),
  ];

  const multi = !!range && (range.r1 !== range.r2 || range.c1 !== range.c2);
  const filterActive = deferredFilter.trim() !== "" || filterUpdating;
  const st = rangeStats;
  const sep = <span aria-hidden="true" className="text-faint">·</span>;
  const stat = (label: string, value: string) => (
    <span className="whitespace-nowrap">
      <span className="text-muted">{label}</span> <span className="text-ink">{value}</span>
    </span>
  );

  return (
    <div className="flex h-full flex-col bg-surface">
      <div
        ref={parentRef}
        className="group/grid min-h-0 flex-1 select-none overflow-auto bg-surface outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        role="grid"
        aria-rowcount={rows.length}
        aria-colcount={result.columns.length}
        aria-multiselectable="true"
        aria-busy={filterUpdating}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <div style={{ width: totalWidth, minWidth: "100%" }}>
          <div
            className="sticky top-0 z-10 grid border-b border-line bg-chrome"
            style={{ gridTemplateColumns: gridCols, height: headerHeight }}
            role="row"
          >
            <div
              className="sticky left-0 z-[2] flex cursor-pointer items-start border-r border-line bg-chrome pl-1 pr-3 text-[11px] text-faint hover:text-ink"
              role="columnheader"
              title="Select all"
              onClick={selectAll}
            >
              <span className="flex w-full shrink-0 items-center justify-between" style={{ height: HEADER_HEIGHT }}>
                {onToggleStats ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStats();
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    aria-pressed={showStats}
                    aria-label="Show column stats"
                    title="Column stats"
                    className={`inline-flex size-6 items-center justify-center rounded transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      showStats ? "text-accent" : "text-faint"
                    }`}
                  >
                    <Icon name="profile" size={14} />
                  </button>
                ) : (
                  <span />
                )}
                <span>#</span>
              </span>
            </div>
            {result.columns.map((col, i) => {
              const active = sort?.column === col;
              const inspected = inspectedColumn === col;
              const colSelected = !!range && i >= range.c1 && i <= range.c2 && (range.mode === "col" || range.mode === "all");
              return (
                <div
                  key={col}
                  role="columnheader"
                  tabIndex={0}
                  aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                  onClick={(e) => {
                    if (e.altKey && onInspect) onInspect(col);
                    else if (e.metaKey || e.ctrlKey) selectColumn(i, e.shiftKey);
                    else {
                      // Snowsight-style: a click selects the column (the footer shows its count) and sorts by it.
                      parentRef.current?.focus({ preventScroll: true });
                      selectColumn(i, false);
                      cycleSort(col);
                    }
                  }}
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
                  title={`${col} — ${result.columnTypes[i]}. Click to sort, ${MOD}-click to select the column, Alt-click to inspect.`}
                  className={`group relative flex min-w-0 cursor-pointer select-none flex-col border-r border-line text-[12px] font-medium hover:bg-sunken ${
                    active ? "text-accent" : "text-ink"
                  } ${active && !colSelected ? "bg-accent-soft" : ""} ${colSelected ? "bg-accent-soft" : ""} ${inspected ? "shadow-[inset_0_-2px_0_var(--accent)]" : ""}`}
                >
                  <div className="flex shrink-0 items-center gap-0.5 px-2" style={{ height: HEADER_HEIGHT }}>
                    <KindGlyph kind={kinds[i]} type={result.columnTypes[i]} />
                    <span className={`min-w-0 flex-1 truncate ${kinds[i] === "numeric" ? "text-right" : ""}`}>{col}</span>
                    <Icon
                      name={active ? (sort!.dir === "asc" ? "sortAsc" : "sortDesc") : "sort"}
                      size={14}
                      className={active ? "text-accent stroke-[2.75]" : "text-faint opacity-0 transition-opacity group-hover:opacity-100"}
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
                      <Icon name="chevronDown" size={14} />
                    </button>
                  </div>
                  {showStats && (onOpenCard || onInspect) && (
                    <ColumnMiniChart
                      result={result}
                      column={col}
                      index={i}
                      onOpen={(anchor) => (onOpenCard ? onOpenCard(col, anchor) : onInspect?.(col))}
                    />
                  )}
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${col} column`}
                    aria-valuemin={MIN_COL}
                    aria-valuemax={MAX_COL}
                    aria-valuenow={widths[i]}
                    tabIndex={0}
                    title="Drag to resize, use arrow keys to adjust, double-click to fit"
                    onPointerDown={(e) => startResize(e, col, widths[i])}
                    onKeyDown={(e) => {
                      if (e.key === "Home") {
                        e.preventDefault();
                        e.stopPropagation();
                        autoFit(col);
                      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                        e.preventDefault();
                        e.stopPropagation();
                        const delta = e.key === "ArrowRight" ? 16 : -16;
                        setOverrides((o) => ({
                          ...o,
                          [col]: Math.min(MAX_COL, Math.max(MIN_COL, (o[col] ?? widths[i]) + delta)),
                        }));
                      }
                    }}
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
              const rowSelected = !!range && item.index >= range.r1 && item.index <= range.r2 && (range.mode === "row" || range.mode === "all");
              return (
                <div
                  key={item.key}
                  role="row"
                  className={`absolute left-0 grid w-full border-b border-line-soft hover:bg-sunken ${odd ? "bg-raised" : "bg-surface"}`}
                  style={{
                    height: item.size,
                    transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
                    gridTemplateColumns: gridCols,
                  }}
                >
                  <div
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      parentRef.current?.focus({ preventScroll: true });
                      selectRow(item.index, e.shiftKey);
                    }}
                    title="Select row"
                    className={`sticky left-0 z-[1] flex cursor-pointer items-center justify-end border-r border-line px-3 font-mono text-[11px] tabular-nums ${
                      rowSelected ? "bg-accent-soft text-ink" : range && item.index >= range.r1 && item.index <= range.r2 ? "bg-chrome text-accent" : "bg-chrome text-faint hover:text-ink"
                    }`}
                  >
                    {item.index + 1}
                  </div>
                  {result.columns.map((col, i) => {
                    const value = row[col];
                    const isNull = value === null || value === undefined;
                    const text = formatValue(value);
                    const inRange = cellInRange(item.index, i);
                    const isFocus = !!range && range.focus.row === item.index && range.focus.col === i;
                    let shadow: string | undefined;
                    if (inRange && range) {
                      const edges: string[] = [];
                      if (item.index === range.r1) edges.push("inset 0 1px 0 0 var(--accent)");
                      if (item.index === range.r2) edges.push("inset 0 -1px 0 0 var(--accent)");
                      if (i === range.c1) edges.push("inset 1px 0 0 0 var(--accent)");
                      if (i === range.c2) edges.push("inset -1px 0 0 0 var(--accent)");
                      if (isFocus && multi) edges.push("inset 0 0 0 2px var(--accent)");
                      if (edges.length) shadow = edges.join(", ");
                    }
                    return (
                      <div
                        key={col}
                        role="gridcell"
                        data-r={item.index}
                        data-c={i}
                        aria-selected={inRange}
                        onMouseDown={(e) => startDrag(e, { row: item.index, col: i })}
                        onDoubleClick={() => {
                          selectCell({ row: item.index, col: i });
                          const t = cellText(value);
                          void copyText(t).then(() => toast(t === "" ? "Copied empty value" : `Copied ${short(t)}`));
                        }}
                        title={isNull ? "NULL" : text.length > 500 ? `${text.slice(0, 500)}…` : text}
                        style={shadow ? { boxShadow: shadow } : undefined}
                        className={`flex min-w-0 items-center border-r border-line-soft px-2 font-mono text-[12px] tabular-nums ${
                          kinds[i] === "numeric" ? "justify-end" : ""
                        } ${inRange && !(isFocus && multi) ? "bg-accent-soft" : ""} ${isNull ? "" : "text-ink"}`}
                      >
                        {isNull ? (
                          <span className="font-sans italic text-faint">NULL</span>
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
              {deferredFilter ? `No rows contain “${deferredFilter}”.` : "The query returned no rows."}
            </p>
          )}
        </div>
        {menu && <ColumnMenu state={menu} items={menuItems(menu.column)} onClose={() => setMenu(null)} />}
      </div>
      {(range || filterActive) && (
        <div
          className="flex shrink-0 items-center gap-2 border-t border-line bg-chrome px-3 text-[12px] tabular-nums"
          style={{ height: FOOTER_HEIGHT }}
          aria-live="polite"
          data-testid="grid-footer"
        >
          {st && range ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
              {range.mode === "col" ? (
                // A selected column reads as a count of its rows, Snowsight-style.
                stat("Count", (range.r2 - range.r1 + 1).toLocaleString())
              ) : (
                <span className="whitespace-nowrap">
                  <span className="text-ink">{st.cells.toLocaleString()}</span> <span className="text-muted">{st.cells === 1 ? "cell" : "cells"}</span>
                </span>
              )}
              {st.numericCount > 0 ? (
                <>
                  {sep}
                  {stat("Sum", formatNumber(st.sum!))}
                  {sep}
                  {stat("Avg", formatNumber(st.avg!))}
                  {sep}
                  {stat("Min", formatNumber(st.min!))}
                  {sep}
                  {stat("Max", formatNumber(st.max!))}
                </>
              ) : (
                <>
                  {sep}
                  {stat("Unique", st.distinct.toLocaleString())}
                </>
              )}
              {st.nulls > 0 && (
                <>
                  {sep}
                  {stat("Nulls", st.nulls.toLocaleString())}
                </>
              )}
            </div>
          ) : (
            <p className="min-w-0 flex-1 truncate text-muted">
              <span className="text-ink">{rows.length.toLocaleString()}</span> of {result.rows.length.toLocaleString()}{" "}
              {result.rows.length === 1 ? "row matches" : "rows match"}
              {filterUpdating && <span className="ml-2 text-faint">Updating filter…</span>}
            </p>
          )}
          {range && (
            <button
              onClick={copyRange}
              className="inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-muted transition-colors hover:bg-sunken hover:text-ink"
              title="Copy selection as TSV"
              aria-label="Copy selection"
            >
              <Icon name="copy" size={12} />
              <Kbd>{MOD}</Kbd>
              <Kbd>C</Kbd>
            </button>
          )}
        </div>
      )}
    </div>
  );
});
