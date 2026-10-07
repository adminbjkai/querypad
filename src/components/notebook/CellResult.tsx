"use client";

import { memo } from "react";
import DataTable from "@/components/results/DataTable";
import { resultMeta } from "@/components/results/result-meta";
import { MAX_RESULT_ROWS } from "@/lib/duckdb/queries";
import { Icon } from "@/components/ui/icons";
import { Chip, Spinner } from "@/components/ui/primitives";
import type { QueryResult } from "@/types";

export type CellRunStatus = "idle" | "running" | "ok" | "error";

export interface CellRun {
  status: CellRunStatus;
  result: QueryResult | null;
  error: string | null;
}

export const IDLE_RUN: CellRun = { status: "idle", result: null, error: null };

const ROW = 28;
const HEADER = 32;
const FOOTER = 28;
/** The grid never grows past this; more rows scroll inside it. */
const MAX_GRID = 320;

/** The outcome of running one cell: a capped results grid with its meta line, or an error card. */
export default memo(function CellResult({ run, label }: { run: CellRun; label: string }) {
  if (run.status === "idle") return null;

  if (run.status === "running") {
    return (
      <div className="relative border-t border-line bg-surface px-3 py-2" role="status" aria-label={`${label} running`}>
        <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-accent-soft">
          <span className="qp-scan absolute inset-y-0 left-0 w-1/3 bg-accent" />
        </div>
        <p className="flex items-center gap-2 text-[12px] text-muted">
          <Spinner />
          Running…
        </p>
      </div>
    );
  }

  if (run.status === "error") {
    return (
      <div className="border-t border-line bg-surface p-3" role="alert" aria-label={`${label} error`}>
        <div className="rounded-lg border border-line bg-danger-soft p-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-danger">
            <Icon name="alert" size={16} />
            The query failed
          </p>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line-soft bg-surface p-2.5 font-mono text-[12px] leading-5 text-ink">
            {run.error}
          </pre>
        </div>
      </div>
    );
  }

  const result = run.result!;
  const truncated = result.rowCount > result.rows.length;
  const meta = (
    <p className="flex h-8 items-center gap-2 whitespace-nowrap px-3 text-[12px] tabular-nums text-muted">
      <span>
        <span className="font-medium text-ink">{result.rowCount.toLocaleString()}</span> {result.rowCount === 1 ? "row" : "rows"}
      </span>
      <span aria-hidden="true" className="text-faint">·</span>
      <span>
        <span className="font-medium text-ink">{result.columns.length}</span> {result.columns.length === 1 ? "column" : "columns"}
      </span>
      <span aria-hidden="true" className="text-faint">·</span>
      <span>{result.executionTimeMs.toLocaleString()} ms</span>
      {truncated && (
        <span title={`Only the first ${MAX_RESULT_ROWS.toLocaleString()} rows are loaded into the grid.`}>
          <Chip tone="warn">showing first {MAX_RESULT_ROWS.toLocaleString()}</Chip>
        </span>
      )}
    </p>
  );

  if (result.columns.length === 0) {
    return (
      <div className="border-t border-line bg-surface" role="region" aria-label={label}>
        <p className="flex h-8 items-center gap-2 px-3 text-[12px] text-muted">
          <Icon name="check" size={14} className="text-ok" />
          Statement ran
          <span aria-hidden="true" className="text-faint">·</span>
          <span className="tabular-nums">{result.executionTimeMs.toLocaleString()} ms</span>
        </p>
      </div>
    );
  }

  const height = Math.min(MAX_GRID, HEADER + Math.max(1, result.rows.length) * ROW + FOOTER + 2);
  return (
    <div className="border-t border-line bg-surface" role="region" aria-label={label}>
      {meta}
      <div className="border-t border-line" style={{ height }}>
        <DataTable key={resultMeta(result).id} result={result} />
      </div>
    </div>
  );
});
