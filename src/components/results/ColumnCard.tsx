"use client";

import { useMemo } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { QueryResult } from "@/types";
import { columnSignals, mapResultColumn } from "@/lib/results/source-tables";
import { Icon } from "@/components/ui/icons";
import { KindGlyph, SectionLabel, btn } from "@/components/ui/primitives";
import { compactDate, compactNumber, getColumnStats, pct } from "./column-stats";
import Popover from "./Popover";
import { formatNumber as num } from "./range-stats";


function Row({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[12px]">
      <dt className="text-muted">{label}</dt>
      <dd className={`min-w-0 truncate text-right font-mono tabular-nums ${tone}`} title={value}>
        {value}
      </dd>
    </div>
  );
}

/**
 * Snowsight-style column card: a popover anchored to the header stats block with the distribution,
 * fill/null shares, the key figures and — QueryPad's own rows — the column's key and join signals
 * from the discovered relationships, plus one-click filters for the top values.
 */
export default function ColumnCard({
  result,
  column,
  sql,
  anchor,
  onFilter,
  onInspect,
  onClose,
}: {
  result: QueryResult;
  column: string;
  /** The SQL that produced the result; used to trace the column back to a loaded table. */
  sql: string;
  anchor: HTMLElement;
  /** Apply the results filter (the toolbar's "Filter rows" state) to one value. */
  onFilter: (value: string) => void;
  onInspect: (column: string) => void;
  onClose: () => void;
}) {
  const tables = useWorkspaceStore((s) => s.tables);
  const relationships = useWorkspaceStore((s) => s.discovery.relationships);
  const verdicts = useWorkspaceStore((s) => s.relationshipVerdicts);
  const profiles = useWorkspaceStore((s) => s.tableProfiles);

  const stats = getColumnStats(result, column);
  const type = result.columnTypes[result.columns.indexOf(column)] ?? "";
  const source = useMemo(() => mapResultColumn(column, sql, tables), [column, sql, tables]);
  const signals = useMemo(
    () => (source ? columnSignals(source, relationships, verdicts, profiles[source.table]?.profile) : null),
    [source, relationships, verdicts, profiles]
  );

  const filled = stats.total - stats.nulls;
  const maxBin = stats.histogram ? Math.max(1, ...stats.histogram.map((b) => b.count)) : 1;
  const maxTop = stats.top[0]?.count ?? 1;
  const fmtBound = (n: number) => (stats.histogramIsDate ? compactDate(n) : compactNumber(n));
  const color = stats.kind === "date" ? "bg-k-date" : "bg-k-num";
  const joinRows: { label: string; value: string }[] = [];
  if (signals) {
    if (signals.unique !== null) joinRows.push({ label: "Unique", value: signals.unique ? "yes" : "no" });
    if (signals.referencedBy.length > 0) {
      joinRows.push({
        label: `Referenced by ${signals.referencedBy.length} ${signals.referencedBy.length === 1 ? "table" : "tables"}`,
        value: signals.referencedBy.join(", "),
      });
    }
    for (const ref of signals.references) {
      joinRows.push({ label: `Matches ${ref.table}.${ref.column}`, value: `${Math.round(ref.overlap * 100)}% overlap` });
    }
  }

  return (
    <Popover anchor={anchor} label={`Column card for ${column}`} onClose={onClose} width={300}>
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
        <KindGlyph type={type} kind={stats.kind} />
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-medium text-ink" title={column}>
          {column}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-faint" title={type}>
          {type}
        </span>
        <button onClick={onClose} className={btn.iconSm} aria-label="Close column card" title="Close">
          <Icon name="x" size={14} />
        </button>
      </div>

      <div className="px-3 py-2">
        {stats.histogram ? (
          <div aria-label="Distribution">
            <div className="flex h-16 items-end gap-px rounded-md bg-raised px-1 pt-1">
              {stats.histogram.map((bin, i) => (
                <div
                  key={i}
                  className={`min-w-0 flex-1 rounded-t-[1px] ${color}`}
                  style={{ height: `${bin.count === 0 ? 0 : Math.max(4, (bin.count / maxBin) * 100)}%` }}
                  title={`${fmtBound(bin.from)} – ${fmtBound(bin.to)}: ${bin.count.toLocaleString()}`}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-faint">
              <span>{stats.minNum !== null ? fmtBound(stats.minNum) : ""}</span>
              <span>{stats.maxNum !== null ? fmtBound(stats.maxNum) : ""}</span>
            </div>
          </div>
        ) : stats.top.length === 0 ? (
          <p className="text-[12px] text-muted">No non-null values.</p>
        ) : (
          <ul className="space-y-1.5" aria-label="Top values">
            {stats.top.map((entry) => (
              <li key={entry.label} className="group/top text-[12px]">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-ink" title={entry.label}>
                    {entry.label === "" ? <span className="italic text-faint">empty</span> : entry.label}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
                    {entry.count.toLocaleString()} · {pct(entry.count, stats.total)}
                  </span>
                  <button
                    onClick={() => {
                      onFilter(entry.label);
                      onClose();
                    }}
                    aria-label={`Show rows with this value: ${entry.label === "" ? "empty" : entry.label}`}
                    title="Show rows with this value"
                    className="inline-flex h-5 shrink-0 items-center gap-1 rounded bg-accent-soft px-1.5 text-[11px] font-medium text-accent opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent group-hover/top:opacity-100"
                  >
                    <Icon name="filter" size={12} />
                    Show rows
                  </button>
                </div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-sunken">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(entry.count / maxTop) * 100}%` }} />
                </div>
              </li>
            ))}
            {stats.distinct > stats.top.length && (
              <li className="text-[11px] text-faint">+ {(stats.distinct - stats.top.length).toLocaleString()} more values</li>
            )}
          </ul>
        )}

        <p className="mt-2 text-[12px] tabular-nums text-muted">
          <span className="text-ink">{pct(filled, stats.total)}</span> filled
          <span aria-hidden="true" className="mx-1.5 text-faint">·</span>
          <span className="text-ink">{pct(stats.nulls, stats.total)}</span> null
        </p>

        <dl className="mt-1 divide-y divide-line-soft border-t border-line-soft">
          <Row label="Distinct" value={stats.distinct.toLocaleString()} />
          {stats.min !== null && <Row label="Min" value={stats.min} />}
          {stats.max !== null && <Row label="Max" value={stats.max} />}
          {stats.sum !== null && <Row label="Sum" value={num(stats.sum)} />}
          {stats.mean !== null && <Row label="Average" value={num(stats.mean)} />}
        </dl>

        {joinRows.length > 0 && source && (
          <section className="mt-2 border-t border-line-soft pt-2" aria-label="Keys and joins">
            <SectionLabel as="h3" className="mb-0.5">
              Keys &amp; joins
            </SectionLabel>
            <p className="truncate font-mono text-[11px] text-faint" title={`${source.table}.${source.column}`}>
              {source.table}.{source.column}
            </p>
            <dl className="divide-y divide-line-soft">
              {joinRows.map((row) => (
                <Row key={row.label} label={row.label} value={row.value} tone="text-join" />
              ))}
            </dl>
          </section>
        )}
      </div>

      <div className="flex items-center justify-end border-t border-line px-2 py-1.5">
        <button
          onClick={() => {
            onInspect(column);
            onClose();
          }}
          className={btn.ghost}
        >
          <Icon name="panelRight" size={14} />
          Open inspector
        </button>
      </div>
    </Popover>
  );
}
