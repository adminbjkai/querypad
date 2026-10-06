"use client";

import { useEffect, useState } from "react";
import type { QueryResult } from "@/types";
import { getColumnStats, peekColumnStats, type ColumnStats } from "./column-stats";

export const DIST_HEIGHT = 22;

const KIND_TEXT: Record<string, string> = {
  numeric: "text-k-num",
  date: "text-k-date",
  text: "text-k-text",
  boolean: "text-k-bool",
  other: "text-k-other",
};

const pct = (part: number, whole: number) => (whole === 0 ? 0 : (part / whole) * 100);

function describe(stats: ColumnStats) {
  const bits = [`${stats.distinct.toLocaleString()} distinct`, `${pct(stats.nulls, stats.total).toFixed(0)}% null`];
  if (stats.min !== null && stats.max !== null) bits.push(`${stats.min} to ${stats.max}`);
  else if (stats.top[0]) bits.push(`top: ${stats.top[0].label}`);
  return bits.join(" · ");
}

/**
 * Snowsight-style header distribution: histogram (numbers/dates) or stacked top-values bar (everything else),
 * with the null share as a trailing marker. Stats are computed lazily and staggered per column so a wide
 * result never blocks the first paint.
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
  onOpen: () => void;
}) {
  const [stats, setStats] = useState<ColumnStats | undefined>(() => peekColumnStats(result, column));
  useEffect(() => {
    if (stats) return;
    const t = setTimeout(() => setStats(getColumnStats(result, column)), Math.min(index * 2, 120));
    return () => clearTimeout(t);
  }, [stats, result, column, index]);

  const nullShare = stats ? pct(stats.nulls, stats.total) : 0;
  const nonNull = stats ? stats.total - stats.nulls : 0;
  const color = KIND_TEXT[stats?.kind ?? "other"];

  return (
    <button
      tabIndex={-1}
      aria-label={`Show stats for ${column}`}
      title={stats ? `${describe(stats)}. Click to open in the inspector.` : "Computing…"}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ height: DIST_HEIGHT }}
      className="flex w-full shrink-0 items-end gap-1 px-2 pb-1 text-left"
    >
      {!stats ? (
        <span aria-hidden="true" className="qp-skeleton h-3 flex-1 rounded-sm" />
      ) : stats.histogram ? (
        <span aria-hidden="true" className={`flex h-4 min-w-0 flex-1 items-end gap-px ${color}`}>
          {(() => {
            const peak = Math.max(1, ...stats.histogram.map((b) => b.count));
            return stats.histogram.map((bin, i) => (
              <span
                key={i}
                className="min-w-0 flex-1 bg-current opacity-80"
                style={{ height: bin.count === 0 ? 1 : `${Math.max(12, (bin.count / peak) * 100)}%`, opacity: bin.count === 0 ? 0.25 : undefined }}
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
                className={`h-full bg-current ${color}`}
                style={{ width: `${(seg.count / stats.total) * 100}%`, opacity: 1 - i * 0.22 }}
              />
            ))}
        </span>
      )}
      {stats && nullShare > 0 && (
        <span aria-hidden="true" className="flex h-4 w-1.5 shrink-0 items-end overflow-hidden rounded-sm bg-sunken">
          <span className="w-full bg-faint" style={{ height: `${Math.max(12, nullShare)}%` }} />
        </span>
      )}
    </button>
  );
}
