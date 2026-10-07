"use client";

import { useEffect, useState } from "react";
import type { QueryResult } from "@/types";
import { copyText } from "@/lib/export/clipboard";
import { toast } from "@/stores/ui-store";
import { Icon } from "@/components/ui/icons";
import { KindGlyph, SectionLabel, btn } from "@/components/ui/primitives";
import { relativeTime } from "@/components/home/format";

/** What produced the current result: SQL, timing, size and column types. */
export default function DetailsView({ result, sql, at }: { result: QueryResult; sql: string; at: number }) {
  const truncated = result.rowCount > result.rows.length;
  // Ticks so "Last run" stays honest while the view is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const summary: { label: string; value: string; title?: string }[] = [
    { label: "Rows", value: result.rowCount.toLocaleString() + (truncated ? ` (showing ${result.rows.length.toLocaleString()})` : "") },
    { label: "Columns", value: result.columns.length.toLocaleString() },
    { label: "Duration", value: `${result.executionTimeMs.toLocaleString()} ms` },
    { label: "Last run", value: relativeTime(at, { now }), title: new Date(at).toLocaleString() },
  ];

  return (
    <div className="h-full overflow-auto bg-surface p-4">
      <div className="space-y-5">
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
          {summary.map(({ label, value, title }) => (
            <div key={label} className="rounded-lg bg-raised px-3 py-2.5">
              <SectionLabel as="div">{label}</SectionLabel>
              <p className="mt-1 truncate text-[16px] font-medium leading-5 tabular-nums text-ink" title={title ?? value}>
                {value}
              </p>
            </div>
          ))}
        </div>

        <section aria-label="SQL">
          <div className="mb-1.5 flex items-center justify-between">
            <SectionLabel as="h3">SQL</SectionLabel>
            <button
              onClick={() => void copyText(sql).then(() => toast("Copied SQL"))}
              disabled={!sql}
              className={btn.ghost}
            >
              <Icon name="copy" size={14} />
              Copy
            </button>
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-raised p-3 font-mono text-[12px] leading-5 text-ink">
            {sql || "The SQL for this result is not available."}
          </pre>
        </section>

        <section aria-label="Columns">
          <SectionLabel as="h3" className="mb-1.5">Columns</SectionLabel>
          <ul className="divide-y divide-line-soft rounded-lg border border-line">
            {result.columns.map((col, i) => (
              <li key={`${col}-${i}`} className="flex h-8 items-center gap-2 px-3 text-[12px]">
                <KindGlyph type={result.columnTypes[i]} />
                <span className="min-w-0 flex-1 truncate font-medium text-ink" title={col}>
                  {col}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted">{result.columnTypes[i]}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
