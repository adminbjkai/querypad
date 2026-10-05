"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { MAX_RESULT_ROWS } from "@/lib/duckdb/queries";
import { detectChartConfig, type ChartConfig } from "@/lib/charts/detect";
import type { QueryResult } from "@/types";
import DataTable from "./DataTable";
import ExportMenu from "./ExportMenu";
import PluginVisualization from "@/components/plugins/PluginVisualization";
import { Icon } from "@/components/ui/icons";
import { Kbd, MOD, btn } from "@/components/ui/primitives";

const ChartPanel = dynamic(() => import("./ChartPanel"), { ssr: false });

type View = "table" | "chart" | string;

export default function ResultsPanel() {
  const tab = useWorkspaceStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const plugins = useWorkspaceStore((s) => s.plugins);
  const openAi = useUiStore((s) => s.openAi);
  const result = tab?.result ?? null;
  const error = tab?.error ?? null;
  const isExecuting = tab?.isExecuting ?? false;

  // View/filter/chart choices reset whenever a new result arrives.
  const [viewState, setViewState] = useState<{ result: QueryResult | null; view: View; filter: string; chart: ChartConfig | null }>({
    result: null,
    view: "table",
    filter: "",
    chart: null,
  });
  const current = viewState.result === result ? viewState : { result, view: "table", filter: "", chart: null };
  const patch = (next: Partial<typeof viewState>) => setViewState({ ...current, ...next, result });

  const detected = useMemo(() => (result ? detectChartConfig(result) : null), [result]);
  const chartConfig = current.chart ?? detected;

  const pluginViews = plugins.flatMap((p) =>
    p.manifest.extensions
      .filter((ext) => ext.type === "visualization")
      .map((ext) => ({
        key: `plugin-${p.manifest.id}`,
        label: p.manifest.name,
        extension: ext as Extract<typeof ext, { type: "visualization" }>,
      }))
  );
  const activePlugin = pluginViews.find((v) => v.key === current.view);

  const scanLine = isExecuting && (
    <div className="absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-accent-soft">
      <span className="qp-scan absolute inset-y-0 left-0 w-1/3 bg-accent" />
    </div>
  );

  if (error && !isExecuting) {
    return (
      <div className="h-full overflow-auto bg-surface p-4">
        <div className="max-w-3xl rounded-lg border border-danger/40 bg-danger-soft/50 p-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-danger">
            <Icon name="alert" size={15} />
            The query failed
          </p>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-ink">{error.message}</pre>
          <button onClick={() => openAi("Fix the current query so it runs.")} className={`${btn.secondary} mt-3`}>
            <Icon name="wand" size={14} />
            Fix with AI
          </button>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="relative flex h-full items-center justify-center bg-surface p-6 text-center">
        {scanLine}
        {isExecuting ? (
          <p className="text-[13px] text-muted">Running…</p>
        ) : (
          <div className="text-[13px] leading-6 text-muted">
            <p>Results appear here.</p>
            <p>
              Run with <Kbd>{MOD}</Kbd> <Kbd>Enter</Kbd>, ask AI with <Kbd>{MOD}</Kbd> <Kbd>K</Kbd>, or press <Kbd>?</Kbd> for shortcuts.
            </p>
          </div>
        )}
      </div>
    );
  }

  const truncated = result.rowCount > result.rows.length;
  const viewButton = (view: View, label: string, disabled = false) => (
    <button
      key={view}
      role="tab"
      aria-selected={current.view === view}
      disabled={disabled}
      onClick={() => patch({ view })}
      className={`h-7 rounded-md px-2.5 text-[13px] transition-colors disabled:opacity-35 ${
        current.view === view ? "bg-sunken font-medium text-ink" : "text-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="relative flex h-full flex-col bg-surface">
      {scanLine}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-2 py-1">
        <div className="flex items-center gap-0.5" role="tablist" aria-label="Result view">
          {viewButton("table", "Table")}
          {viewButton("chart", "Chart", !chartConfig)}
          {pluginViews.map((v) => viewButton(v.key, v.label))}
        </div>
        <p className="flex items-center gap-3 text-[12px] tabular-nums text-muted">
          <span>
            <span className="font-medium text-ink">{result.rowCount.toLocaleString()}</span> {result.rowCount === 1 ? "row" : "rows"}
          </span>
          <span>{result.executionTimeMs} ms</span>
          {truncated && <span className="text-warn">showing first {MAX_RESULT_ROWS.toLocaleString()}</span>}
        </p>
        <div className="ml-auto flex items-center gap-1.5">
          {current.view === "table" && (
            <label className="relative">
              <Icon name="filter" size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
              <input
                value={current.filter}
                onChange={(e) => patch({ filter: e.target.value })}
                placeholder="Filter rows"
                className="h-7 w-36 rounded-md border border-line bg-surface pl-7 pr-2 text-[12px] text-ink outline-none placeholder:text-faint focus:w-52 focus:border-accent transition-[width]"
                aria-label="Filter rows"
              />
            </label>
          )}
          <ExportMenu result={result} query={tab?.lastRunSql ?? tab?.query ?? ""} />
        </div>
      </div>
      <div className={`min-h-0 flex-1 transition-opacity ${isExecuting ? "opacity-50" : ""}`}>
        {current.view === "chart" && chartConfig ? (
          <ChartPanel result={result} config={chartConfig} onConfigChange={(chart) => patch({ chart })} />
        ) : activePlugin ? (
          <PluginVisualization extension={activePlugin.extension} pluginName={activePlugin.label} result={result} />
        ) : (
          <DataTable result={result} filter={current.filter} />
        )}
      </div>
    </div>
  );
}
