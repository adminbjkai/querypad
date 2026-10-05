"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { QueryResult } from "@/types";
import { formatValue } from "@/lib/utils";
import { classifyType } from "@/lib/duckdb/sql-utils";
import { copyText } from "@/lib/export/clipboard";
import { toast } from "@/stores/ui-store";
import { Icon } from "@/components/ui/icons";
import { KindGlyph } from "@/components/ui/primitives";

const ROW_HEIGHT = 30;
type Sort = { column: string; dir: "asc" | "desc" } | null;

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1; // nulls last
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/**
 * Estimate a column width: the header needs room for the kind glyph and sort icon
 * (~7.3px/char of UI text), values are 12px monospace (~7.3px/char).
 */
function widthFor(name: string, rows: Record<string, unknown>[]): number {
  const header = name.length * 7.3 + 58;
  let chars = 0;
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    chars = Math.max(chars, formatValue(rows[i][name]).length);
  }
  return Math.round(Math.min(380, Math.max(84, header, chars * 7.3 + 24)));
}

export default function DataTable({ result, filter = "" }: { result: QueryResult; filter?: string }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [sort, setSort] = useState<Sort>(null);

  const kinds = useMemo(
    () => result.columns.map((_, i) => classifyType(result.columnTypes[i] ?? "")),
    [result]
  );
  const widths = useMemo(() => result.columns.map((c) => widthFor(c, result.rows)), [result]);
  const gridCols = `56px ${widths.map((w) => `${w}px`).join(" ")}`;
  const totalWidth = 56 + widths.reduce((a, b) => a + b, 0);

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
  });

  const cycleSort = (column: string) =>
    setSort((s) =>
      s?.column !== column ? { column, dir: "asc" } : s.dir === "asc" ? { column, dir: "desc" } : null
    );

  if (result.columns.length === 0) {
    return <p className="p-4 text-[13px] text-muted">The statement ran and returned no columns.</p>;
  }

  return (
    <div ref={parentRef} className="h-full overflow-auto bg-surface" role="grid" aria-rowcount={rows.length}>
      <div style={{ width: totalWidth, minWidth: "100%" }}>
        <div
          className="sticky top-0 z-10 grid border-b border-line bg-raised"
          style={{ gridTemplateColumns: gridCols }}
          role="row"
        >
          <div className="px-3 py-1.5 text-right text-[11px] text-faint" role="columnheader">
            #
          </div>
          {result.columns.map((col, i) => {
            const active = sort?.column === col;
            return (
              <button
                key={col}
                role="columnheader"
                aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                onClick={() => cycleSort(col)}
                title={`${col} — ${result.columnTypes[i]}. Click to sort.`}
                className={`group flex items-center gap-0.5 overflow-hidden px-2 py-1.5 text-left text-[12px] font-medium hover:bg-sunken ${
                  kinds[i] === "numeric" ? "flex-row-reverse text-right" : ""
                } ${active ? "text-accent" : "text-ink"}`}
              >
                <KindGlyph kind={kinds[i]} type={result.columnTypes[i]} />
                <span className="truncate">{col}</span>
                <Icon
                  name={active ? (sort!.dir === "asc" ? "sortAsc" : "sortDesc") : "sort"}
                  size={12}
                  className={active ? "" : "text-faint opacity-0 group-hover:opacity-100"}
                />
              </button>
            );
          })}
        </div>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            return (
              <div
                key={item.key}
                role="row"
                className="absolute left-0 grid w-full border-b border-line/60 hover:bg-raised"
                style={{ height: item.size, transform: `translateY(${item.start}px)`, gridTemplateColumns: gridCols }}
              >
                <div className="flex items-center justify-end px-3 font-mono text-[11px] tabular-nums text-faint">
                  {item.index + 1}
                </div>
                {result.columns.map((col, i) => {
                  const value = row[col];
                  const isNull = value === null || value === undefined;
                  const text = formatValue(value);
                  return (
                    <div
                      key={col}
                      role="gridcell"
                      onClick={() =>
                        void copyText(isNull ? "" : text).then(() => toast(`Copied ${text.length > 40 ? `${text.slice(0, 40)}…` : text}`))
                      }
                      title={text}
                      className={`flex cursor-copy items-center overflow-hidden px-2 font-mono text-[12px] tabular-nums ${
                        kinds[i] === "numeric" ? "justify-end" : ""
                      } ${isNull ? "italic text-faint" : "text-ink"}`}
                    >
                      <span className="truncate">{isNull ? "null" : text}</span>
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
    </div>
  );
}
