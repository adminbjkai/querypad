"use client";

import { SectionLabel } from "@/components/ui/primitives";
import { pct, type ColumnStats } from "./column-stats";
import { formatNumber as num } from "./range-stats";

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

/** Full statistics for one column: counts, range, distribution and top values. */
export default function ColumnDetails({ stats }: { stats: ColumnStats }) {
  const maxBin = stats.histogram ? Math.max(1, ...stats.histogram.map((b) => b.count)) : 1;
  const maxTop = stats.top[0]?.count ?? 1;
  const fmtBound = (n: number) => (stats.histogramIsDate ? new Date(n).toISOString().slice(0, 19).replace("T", " ") : num(n));

  return (
    <div className="px-3 py-2">
    <p className="mb-1 truncate font-mono text-[11px] text-faint" title={stats.type}>
      {stats.type || "unknown type"}
    </p>
    <dl className="divide-y divide-line-soft">
      <Stat label="Rows" value={stats.total.toLocaleString()} />
      <Stat label="Nulls" value={`${stats.nulls.toLocaleString()} (${pct(stats.nulls, stats.total)})`} />
      <Stat label="Distinct" value={stats.distinct.toLocaleString()} />
      {stats.min !== null && <Stat label="Min" value={stats.min} />}
      {stats.max !== null && <Stat label="Max" value={stats.max} />}
      {stats.mean !== null && <Stat label="Mean" value={num(stats.mean)} />}
    </dl>

    {stats.histogram && (
      <section className="mt-4" aria-label="Distribution">
        <SectionLabel as="h3" className="mb-1.5">Distribution</SectionLabel>
        <div className="flex h-16 items-end gap-px rounded-md bg-raised px-1 pt-1">
          {stats.histogram.map((bin, i) => (
            <div
              key={i}
              className="min-w-0 flex-1 rounded-t-[1px] bg-k-num"
              style={{ height: `${bin.count === 0 ? 0 : Math.max(4, (bin.count / maxBin) * 100)}%` }}
              title={`${fmtBound(bin.from)} – ${fmtBound(bin.to)}: ${bin.count.toLocaleString()}`}
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
      <SectionLabel as="h3" className="mb-1.5">Top values</SectionLabel>
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
        <p className="mt-1.5 text-[11px] text-faint">+ {(stats.distinct - stats.top.length).toLocaleString()} more values</p>
      )}
    </section>
    </div>
  );
}
