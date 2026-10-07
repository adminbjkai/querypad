"use client";

import type { QueryResult } from "@/types";
import { copyText } from "@/lib/export/clipboard";
import { toast } from "@/stores/ui-store";
import { Icon } from "@/components/ui/icons";
import { SectionLabel, btn } from "@/components/ui/primitives";
import Popover from "./Popover";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[12px]">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-right font-mono tabular-nums text-ink">{children}</dd>
    </div>
  );
}

/**
 * Popover behind the "N rows" meta: size, duration, when the query ran and its SQL. DuckDB-Wasm
 * reports one wall-clock duration (no parse/execute split), so the bar shows the total only.
 */
export default function QueryDetails({
  result,
  sql,
  at,
  anchor,
  onClose,
}: {
  result: QueryResult;
  sql: string;
  at: number;
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const truncated = result.rowCount > result.rows.length;
  return (
    <Popover anchor={anchor} label="Query details" onClose={onClose} width={340}>
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <SectionLabel as="h3">Query details</SectionLabel>
        <button onClick={onClose} className={btn.iconSm} aria-label="Close query details" title="Close">
          <Icon name="x" size={14} />
        </button>
      </div>
      <dl className="divide-y divide-line-soft px-3 py-1">
        <Row label="Rows">
          {result.rowCount.toLocaleString()}
          {truncated && <span className="text-muted"> (showing {result.rows.length.toLocaleString()})</span>}
        </Row>
        <Row label="Columns">{result.columns.length.toLocaleString()}</Row>
        <Row label="Duration">
          <span className="flex items-center justify-end gap-2">
            <span className="relative h-1.5 w-24 overflow-hidden rounded-full bg-sunken" aria-hidden="true" title="Total">
              <span className="absolute inset-y-0 left-0 w-full rounded-full bg-accent" />
            </span>
            <span>
              <span className="text-muted">Total</span> {result.executionTimeMs.toLocaleString()} ms
            </span>
          </span>
        </Row>
        <Row label="Ran at">{new Date(at).toLocaleString()}</Row>
      </dl>
      <div className="border-t border-line px-3 py-2">
        <div className="mb-1 flex items-center justify-between">
          <SectionLabel as="h3">SQL</SectionLabel>
          <button onClick={() => void copyText(sql).then(() => toast("Copied SQL"))} disabled={!sql} className={btn.ghost}>
            <Icon name="copy" size={14} />
            Copy
          </button>
        </div>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-raised p-2 font-mono text-[12px] leading-5 text-ink">
          {sql || "The SQL for this result is not available."}
        </pre>
      </div>
    </Popover>
  );
}
