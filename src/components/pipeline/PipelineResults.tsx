"use client";

import type { PipelineExecutionResult } from "@/types/pipeline";
import DataTable from "@/components/results/DataTable";
import { Icon } from "@/components/ui/icons";

export default function PipelineResults({ stepName, result }: { stepName: string; result: PipelineExecutionResult | null }) {
  if (!result) {
    return (
      <p className="flex h-full items-center justify-center bg-surface p-6 text-center text-[13px] text-muted">
        Run the pipeline, then pick a step to see its rows.
      </p>
    );
  }
  if (result.error) {
    return (
      <div className="h-full bg-surface p-4">
        <div className="rounded-lg border border-danger/40 bg-danger-soft/50 p-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-danger">
            <Icon name="alert" size={15} />
            Step <span className="font-mono">{stepName}</span> failed
          </p>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-[12px] text-ink">{result.error.message}</pre>
        </div>
      </div>
    );
  }
  if (!result.result) return <p className="p-4 text-[13px] text-muted">No rows.</p>;
  return (
    <div className="flex h-full flex-col bg-surface">
      <p className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-1.5 text-[12px] tabular-nums text-muted">
        <span className="font-mono font-medium text-ink">{stepName}</span>
        <span>{result.result.rowCount.toLocaleString()} rows</span>
        <span>{result.executionTimeMs} ms</span>
      </p>
      <div className="min-h-0 flex-1">
        <DataTable result={result.result} />
      </div>
    </div>
  );
}
