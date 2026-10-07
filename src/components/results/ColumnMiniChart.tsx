"use client";

import { useEffect, useState } from "react";
import type { QueryResult } from "@/types";
import { compactBound, compactDate, compactNumber, getColumnStats, peekColumnStats, sharePct, type ColumnStats } from "./column-stats";

/** Height of the header block under a column name: distribution plus two 14px stats lines. */
export const DIST_HEIGHT = 56;
const LINE = 14;

const KIND_TEXT: Record<string, string> = {
  numeric: "text-k-num",
  date: "text-k-date",
  text: "text-k-text",
  boolean: "text-k-bool",
  other: "text-k-other",
};

const fmtPct = (n: number) => `${n < 1 && n > 0 ? "<1" : Math.round(n)}%`;
const fmtCount = (n: number) => `${n.toLocaleString()} ${n === 1 ? "row" : "rows"}`;

function describe(stats: ColumnStats) {
  const bits = [`${stats.distinct.toLocaleString()} distinct`, `${fmtPct(sharePct(stats.nulls, stats.total))} null`];
  if (stats.min !== null && stats.max !== null) bits.push(`${stats.min} to ${stats.max}`);
  else if (stats.top[0]) bits.push(`top: ${stats.top[0].label}`);
  return bits.join(" · ");
}

function binTitle(stats: ColumnStats, bin: { from: number; to: number; count: number }, last: boolean) {
  const f = stats.histogramIsDate ? compactDate : compactNumber;
  const range = bin.from === bin.to ? f(bin.from) : `${f(bin.from)} – ${f(bin.to)}${last ? "" : ")"}`;
  return `${range}: ${fmtCount(bin.count)}`;
}

/** Compact stats lines under the distribution: one (min/max, the histogram takes the rest) or two (top values). */
function statsLines(stats: ColumnStats): [string, string][] {
  if (stats.histogram) return [[compactBound(stats, "min"), compactBound(stats, "max")]];
  const [first, second] = stats.top;
  const line = (t?: { label: string; count: number }): [string, string] =>
    t ? [t.label, fmtPct(sharePct(t.count, stats.total))] : ["", ""];
  if (stats.kind === "boolean") {
    const share = (v: string) => fmtPct(sharePct(stats.top.find((t) => t.label === v)?.count ?? 0, stats.total));
    return stats.total - stats.nulls > 0 ? [["true", share("true")], ["false", share("false")]] : [["", ""], ["", ""]];
  }
  if (stats.distinct > 2) return [line(first), [`+${(stats.distinct - 1).toLocaleString()} more`, ""]];
  return [line(first), line(second)];
}

/**
 * Snowsight-style header block: histogram (numbers/dates) or stacked top-values bar (everything else),
 * with the null share as a trailing marker, then two mono stats lines (min/max, or top values with their
 * share). Stats are computed lazily and staggered per column so a wide result never blocks the first paint.
 */
export default function ColumnMiniChart({
  result,
  column,
  index,
  onOpen,
}: {
  result: QueryResult;
  column: string;
  index: number;
  onOpen: (anchor: HTMLElement) => void;
}) {
  const [stats, setStats] = useState<ColumnStats | undefined>(() => peekColumnStats(result, column));
  useEffect(() => {
    if (stats) return;
    const t = setTimeout(() => setStats(getColumnStats(result, column)), Math.min(index * 2, 120));
    return () => clearTimeout(t);
  }, [stats, result, column, index]);

  const nullShare = stats ? sharePct(stats.nulls, stats.total) : 0;
  const nonNull = stats ? stats.total - stats.nulls : 0;
  const color = KIND_TEXT[stats?.kind ?? "other"];
  const lines = stats ? statsLines(stats) : null;

  return (
    <button
      tabIndex={-1}
      aria-label={`Show stats for ${column}`}
      title={stats ? `${describe(stats)}. Click for the column card.` : "Computing…"}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(e.currentTarget);
      }}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ height: DIST_HEIGHT }}
      className="flex w-full shrink-0 flex-col px-2 pb-1 text-left font-normal"
    >
      <span className="flex min-h-0 flex-1 items-end gap-1 pb-1">
        {!stats ? (
          <span aria-hidden="true" className="qp-skeleton h-3 flex-1 rounded-sm" />
        ) : stats.histogram ? (
          <span aria-hidden="true" className={`flex h-full min-w-0 flex-1 items-end gap-px ${color}`}>
            {(() => {
              const peak = Math.max(1, ...stats.histogram.map((b) => b.count));
              const last = stats.histogram.length - 1;
              return stats.histogram.map((bin, i) => (
                <span
                  key={i}
                  title={binTitle(stats, bin, i === last)}
                  className="min-w-0 flex-1 bg-current"
                  style={{ height: bin.count === 0 ? 1 : `${Math.max(10, (bin.count / peak) * 100)}%`, opacity: bin.count === 0 ? 0.25 : 0.8 }}
                />
              ));
            })()}
          </span>
        ) : (
          <span aria-hidden="true" className="flex h-2 min-w-0 flex-1 gap-px overflow-hidden rounded-sm bg-sunken">
            {nonNull > 0 &&
              stats.top.slice(0, 4).map((seg, i) => (
                <span
                  key={seg.label}
                  title={`${seg.label}: ${fmtCount(seg.count)}`}
                  className={`h-full bg-current ${color}`}
                  style={{ width: `${(seg.count / stats.total) * 100}%`, opacity: 1 - i * 0.22 }}
                />
              ))}
          </span>
        )}
        {stats && nullShare > 0 && (
          <span
            aria-hidden="true"
            title={`NULL: ${fmtCount(stats.nulls)}`}
            className="flex h-4 w-1.5 shrink-0 items-end overflow-hidden rounded-sm bg-sunken"
          >
            <span className="w-full bg-faint" style={{ height: `${Math.max(12, nullShare)}%` }} />
          </span>
        )}
      </span>
      {(lines ?? [["", ""], ["", ""]]).map(([left, right], i) => (
        <span
          key={i}
          className="flex shrink-0 items-center justify-between gap-2 font-mono text-[11px] tabular-nums text-muted"
          style={{ height: LINE, lineHeight: `${LINE}px` }}
        >
          <span className="min-w-0 truncate" title={left.length > 12 ? left : undefined}>{left}</span>
          <span className="shrink-0">{right}</span>
        </span>
      ))}
    </button>
  );
}
