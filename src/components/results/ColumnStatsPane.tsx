"use client";

import { useEffect, useState } from "react";
import type { QueryResult } from "@/types";
import { Icon } from "@/components/ui/icons";
import { KindGlyph, btn } from "@/components/ui/primitives";
import { getColumnStats, pct, peekColumnStats, type ColumnStats } from "./column-stats";
import ColumnDetails from "./ColumnInspector";

/** Tiny inline chart: mini histogram for numbers/dates, a share-of-rows bar of the top values otherwise. */
function Sparkline({ stats }: { stats: ColumnStats }) {
  if (stats.histogram) {
    const max = Math.max(1, ...stats.histogram.map((b) => b.count));
    return (
      <span aria-hidden="true" className={`flex h-5 w-14 items-end gap-px ${stats.kind === "date" ? "text-k-date" : "text-k-num"}`}>
        {stats.histogram.map((bin, i) => (
          <span
            key={i}
            className="min-w-0 flex-1 bg-current"
            style={{ height: `${bin.count === 0 ? 0 : Math.max(12, (bin.count / max) * 100)}%` }}
          />
        ))}
      </span>
    );
  }
  const nonNull = stats.total - stats.nulls;
  if (nonNull === 0) return <span aria-hidden="true" className="h-1.5 w-14 rounded-full bg-sunken" />;
  const segments = stats.top.slice(0, 4);
  return (
    <span aria-hidden="true" className="flex h-1.5 w-14 gap-px overflow-hidden rounded-full bg-sunken">
      {segments.map((seg, i) => (
        <span
          key={seg.label}
          className="h-full bg-accent"
          style={{ width: `${(seg.count / nonNull) * 100}%`, opacity: 1 - i * 0.22 }}
        />
      ))}
    </span>
  );
}

function ColumnRow({
  result,
  column,
  index,
  expanded,
  onToggle,
}: {
  result: QueryResult;
  column: string;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  // Stats are computed lazily, one column per task, so a wide result never blocks the UI.
  const [computed, setComputed] = useState<ColumnStats | undefined>(() => peekColumnStats(result, column));
  useEffect(() => {
    if (computed) return;
    const t = setTimeout(() => setComputed(getColumnStats(result, column)), Math.min(index, 40));
    return () => clearTimeout(t);
  }, [computed, result, column, index]);
  const stats = computed ?? (expanded ? getColumnStats(result, column) : undefined);
  const type = result.columnTypes[result.columns.indexOf(column)] ?? "";

  return (
    <li className="border-b border-line-soft">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        title={`${column}${type ? ` — ${type}` : ""}`}
        className={`flex w-full items-center gap-1.5 px-2 py-1.5 text-left transition-colors hover:bg-sunken ${expanded ? "bg-accent-soft" : ""}`}
      >
        <Icon name="chevronRight" size={14} className={`text-faint transition-transform ${expanded ? "rotate-90" : ""}`} />
        <KindGlyph type={type} kind={stats?.kind} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium text-ink">{column}</span>
          <span className="block truncate text-[11px] tabular-nums text-faint">
            {stats ? `${stats.distinct.toLocaleString()} unique · ${pct(stats.nulls, stats.total)} null` : "…"}
          </span>
        </span>
        {stats && <Sparkline stats={stats} />}
      </button>
      {expanded && stats && <ColumnDetails stats={stats} />}
    </li>
  );
}

/** Snowsight-style results sidebar: every column with compact stats; click one to expand its details. */
export default function ColumnStatsPane({
  result,
  column,
  onColumnChange,
  onClose,
}: {
  result: QueryResult;
  /** The column the grid has selected or the menu asked to inspect. */
  column: string;
  onColumnChange: (column: string) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState<string | null>(column);
  const [seen, setSeen] = useState(column);
  if (seen !== column) {
    setSeen(column);
    setOpen(column);
  }
  const truncated = result.rowCount > result.rows.length;

  return (
    <aside aria-label="Column inspector" className="flex h-full w-[280px] shrink-0 flex-col border-l border-line bg-surface">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line bg-chrome pl-3 pr-2">
        <p
          className="min-w-0 flex-1 truncate text-[12px] tabular-nums text-muted"
          title={truncated ? `Stats cover the ${result.rows.length.toLocaleString()} rows loaded in the grid.` : undefined}
        >
          <span className="font-medium text-ink">{result.columns.length}</span> {result.columns.length === 1 ? "column" : "columns"} ·{" "}
          <span className="font-medium text-ink">{result.rowCount.toLocaleString()}</span> {result.rowCount === 1 ? "row" : "rows"}
        </p>
        <button onClick={onClose} className={btn.icon} aria-label="Close inspector" title="Close inspector">
          <Icon name="x" size={14} />
        </button>
      </div>
      <ul className="min-h-0 flex-1 overflow-auto">
        {result.columns.map((c, i) => (
          <ColumnRow
            key={c}
            result={result}
            column={c}
            index={i}
            expanded={open === c}
            onToggle={() => {
              setOpen(open === c ? null : c);
              if (open !== c) onColumnChange(c);
            }}
          />
        ))}
      </ul>
    </aside>
  );
}
