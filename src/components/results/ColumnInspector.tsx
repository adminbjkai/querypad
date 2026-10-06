"use client";

import { useMemo } from "react";
import type { QueryResult } from "@/types";
import { Icon } from "@/components/ui/icons";
import { KindGlyph, btn } from "@/components/ui/primitives";
import { computeColumnStats } from "./column-stats";

const num = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 4 });
const pct = (part: number, whole: number) => (whole === 0 ? "0%" : `${((part / whole) * 100).toFixed(part > 0 && part / whole < 0.001 ? 2 : 1).replace(/\.0$/, "")}%`);

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[12px]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono tabular-nums text-ink" title={title ?? value}>
        {value}
      </dd>
    </div>
  );
}

/** Right-hand drawer with client-side statistics for one result column. */
export default function ColumnInspector({
  result,
  column,
  onColumnChange,
  onClose,
}: {
  result: QueryResult;
  column: string;
  onColumnChange: (column: string) => void;
  onClose: () => void;
}) {
  const stats = useMemo(() => computeColumnStats(result, column), [result, column]);
  const maxBin = stats.histogram ? Math.max(1, ...stats.histogram.map((b) => b.count)) : 1;
  const maxTop = stats.top[0]?.count ?? 1;

  return (
    <aside aria-label="Column inspector" className="flex h-full w-72 shrink-0 flex-col border-l border-line bg-surface">
      <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1.5">
        <KindGlyph kind={stats.kind} type={stats.type} />
        <select
          value={column}
          onChange={(e) => onColumnChange(e.target.value)}
          aria-label="Inspected column"
          className="h-7 min-w-0 flex-1 rounded-md border border-line bg-surface px-1.5 text-[12px] font-medium text-ink outline-none focus:border-accent"
        >
          {result.columns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button onClick={onClose} className={btn.icon} aria-label="Close inspector" title="Close inspector">
          <Icon name="x" size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        <p className="mb-1 truncate font-mono text-[11px] text-faint" title={stats.type}>
          {stats.type || "unknown type"}
        </p>
        <dl className="divide-y divide-line/60">
          <Stat label="Rows" value={stats.total.toLocaleString()} />
          <Stat label="Nulls" value={`${stats.nulls.toLocaleString()} (${pct(stats.nulls, stats.total)})`} />
          <Stat label="Distinct" value={stats.distinct.toLocaleString()} />
          {stats.min !== null && <Stat label="Min" value={stats.min} />}
          {stats.max !== null && <Stat label="Max" value={stats.max} />}
          {stats.mean !== null && <Stat label="Mean" value={num(stats.mean)} />}
        </dl>

        {stats.histogram && (
          <section className="mt-4" aria-label="Distribution">
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Distribution</h3>
            <div className="flex h-16 items-end gap-px rounded-md bg-raised px-1 pt-1">
              {stats.histogram.map((bin, i) => (
                <div
                  key={i}
                  className="min-w-0 flex-1 rounded-t-[1px] bg-k-num"
                  style={{ height: `${bin.count === 0 ? 0 : Math.max(4, (bin.count / maxBin) * 100)}%` }}
                  title={`${num(bin.from)} – ${num(bin.to)}: ${bin.count.toLocaleString()}`}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-faint">
              <span>{stats.min}</span>
              <span>{stats.max}</span>
            </div>
          </section>
        )}

        <section className="mt-4" aria-label="Top values">
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Top values</h3>
          {stats.top.length === 0 ? (
            <p className="text-[12px] text-muted">No non-null values.</p>
          ) : (
            <ul className="space-y-1.5">
              {stats.top.map((entry) => (
                <li key={entry.label} className="text-[12px]">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate font-mono text-ink" title={entry.label}>
                      {entry.label === "" ? <span className="italic text-faint">empty</span> : entry.label}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
                      {entry.count.toLocaleString()} · {pct(entry.count, stats.total)}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-sunken">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(entry.count / maxTop) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {stats.distinct > stats.top.length && (
            <p className="mt-1.5 text-[11px] text-faint">+ {(stats.distinct - stats.top.length).toLocaleString()} more distinct values</p>
          )}
        </section>
      </div>
    </aside>
  );
}
