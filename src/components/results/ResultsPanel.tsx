"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { MAX_RESULT_ROWS } from "@/lib/duckdb/queries";
import { detectChartConfig, type ChartConfig } from "@/lib/charts/detect";
import type { QueryResult } from "@/types";
import DataTable from "./DataTable";
import ColumnStatsPane from "./ColumnStatsPane";
import DetailsView from "./DetailsView";
import ExportMenu from "./ExportMenu";
import { resultMeta } from "./result-meta";
import PluginVisualization from "@/components/plugins/PluginVisualization";
import { Icon } from "@/components/ui/icons";
import { Kbd, MOD, Spinner, btn } from "@/components/ui/primitives";

const ChartPanel = dynamic(() => import("./ChartPanel"), { ssr: false });

const STATS_KEY = "querypad-grid-stats";
const STATS_EVENT = "qp-grid-stats";
const subscribeStats = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(STATS_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(STATS_EVENT, cb);
  };
};
const readStats = () => {
  try {
    return localStorage.getItem(STATS_KEY);
  } catch {
    return null;
  }
};

type View = "table" | "chart" | "details" | string;

export default function ResultsPanel() {
  const tab = useWorkspaceStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const plugins = useWorkspaceStore((s) => s.plugins);
  const openAi = useUiStore((s) => s.openAi);
  const result = tab?.result ?? null;
  // Header distributions: an explicit choice is remembered, otherwise on for results of up to 50 columns.
  const statsPref = useSyncExternalStore(subscribeStats, readStats, () => null);
  const showStats = statsPref === null ? (result?.columns.length ?? 0) <= 50 : statsPref === "1";
  const toggleStats = () => {
    try {
      localStorage.setItem(STATS_KEY, showStats ? "0" : "1");
    } catch {}
    window.dispatchEvent(new Event(STATS_EVENT));
  };
  const error = tab?.error ?? null;
  const isExecuting = tab?.isExecuting ?? false;

  // View/filter/chart choices reset whenever a new result arrives.
  const [viewState, setViewState] = useState<{
    result: QueryResult | null;
    view: View;
    filter: string;
    chart: ChartConfig | null;
    inspectCol: string | null;
  }>({ result: null, view: "table", filter: "", chart: null, inspectCol: null });
  const current = viewState.result === result ? viewState : { result, view: "table", filter: "", chart: null, inspectCol: null };
  const patch = (next: Partial<typeof viewState>) => setViewState({ ...current, ...next, result });
  // The inspector drawer stays open across re-runs; its column falls back to the first one.
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const inspectedColumn =
    result && inspectorOpen ? (current.inspectCol && result.columns.includes(current.inspectCol) ? current.inspectCol : result.columns[0] ?? null) : null;

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
      <div className="h-full overflow-auto bg-surface p-4" role="alert">
        <div className="max-w-3xl rounded-lg border border-danger/40 bg-danger-soft/50 p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-danger">
            <Icon name="alert" size={15} />
            The query failed
          </p>
          <p className="mt-1 text-[12px] text-muted">DuckDB could not run this statement. Review the error, then edit and run it again.</p>
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-danger/20 bg-surface/70 p-3 font-mono text-[12px] leading-5 text-ink">{error.message}</pre>
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
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <Spinner />
            Running…
          </p>
        ) : (
          <div className="max-w-md text-[13px] leading-6 text-muted">
            <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl border border-line bg-raised text-muted shadow-sm">
              <Icon name="table" size={18} />
            </span>
            <p className="font-semibold text-ink">Your query results will appear here</p>
            <p className="mt-1">Explore your data with SQL, then sort, filter, inspect and export the result.</p>
            <p className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
              Run with <Kbd>{MOD}</Kbd> <Kbd>Enter</Kbd>
              <span aria-hidden="true" className="mx-1 text-faint">·</span>
              Ask AI with <Kbd>{MOD}</Kbd> <Kbd>K</Kbd>
              <span aria-hidden="true" className="mx-1 text-faint">·</span>
              Press <Kbd>?</Kbd> for shortcuts
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
      className={`relative h-9 px-3 text-[13px] transition-colors disabled:opacity-45 ${
        current.view === view ? "font-medium text-ink" : "text-muted hover:text-ink"
      }`}
    >
      {label}
      {current.view === view && <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-0.5 rounded-t-sm bg-accent" />}
    </button>
  );
  const inspect = (column: string) => {
    setInspectorOpen(true);
    patch({ inspectCol: column });
  };
  const showTable = !(current.view === "chart" && chartConfig) && !activePlugin && current.view !== "details";
  const sql = tab?.lastRunSql ?? tab?.query ?? "";

  return (
    <div className="relative flex h-full flex-col bg-surface">
      {scanLine}
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-chrome px-2 py-1">
        <div className="flex h-8 max-w-full min-w-0 shrink-0 items-center overflow-x-auto" role="tablist" aria-label="Result view">
          {viewButton("table", "Table")}
          {viewButton("chart", "Chart", !chartConfig)}
          {viewButton("details", "Details")}
          {pluginViews.map((v) => viewButton(v.key, v.label))}
        </div>
        <p className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap text-[12px] tabular-nums text-muted">
          <span>
            <span className="font-medium text-ink">{result.rowCount.toLocaleString()}</span> {result.rowCount === 1 ? "row" : "rows"}
          </span>
          <span aria-hidden="true" className="text-faint">·</span>
          <span>
            <span className="font-medium text-ink">{result.columns.length}</span> {result.columns.length === 1 ? "column" : "columns"}
          </span>
          <span aria-hidden="true" className="text-faint">·</span>
          <span className="hidden md:inline">{result.executionTimeMs.toLocaleString()} ms</span>
          {truncated && (
            <span
              className="rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-medium text-warn"
              title={`Only the first ${MAX_RESULT_ROWS.toLocaleString()} rows are loaded into the grid. Parquet export includes all rows.`}
            >
              showing first {MAX_RESULT_ROWS.toLocaleString()}
            </span>
          )}
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {current.view === "table" && (
            <label className="relative">
              <Icon name="filter" size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
              <input
                value={current.filter}
                onChange={(e) => patch({ filter: e.target.value })}
                placeholder="Filter rows"
                className="h-7 w-28 rounded-md border border-line bg-raised pl-7 pr-2 text-[12px] text-ink outline-none placeholder:text-faint transition-[width] focus:w-44 focus:border-accent sm:w-36"
                aria-label="Filter rows"
              />
            </label>
          )}
          {current.view === "table" && result.columns.length > 0 && (
            <button
              onClick={toggleStats}
              aria-pressed={showStats}
              aria-label="Show column stats"
              title="Show column stats"
              className={`${btn.icon} ${showStats ? "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent" : ""}`}
            >
              <Icon name="profile" size={15} />
            </button>
          )}
          {current.view === "table" && result.columns.length > 0 && (
            <button
              onClick={() => (inspectorOpen ? setInspectorOpen(false) : inspect(current.inspectCol ?? result.columns[0]))}
              aria-pressed={inspectorOpen}
              aria-label="Column inspector"
              title="Column inspector"
              className={`${btn.icon} ${inspectorOpen ? "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent" : ""}`}
            >
              <Icon name="panelRight" size={15} />
            </button>
          )}
          <ExportMenu result={result} query={tab?.lastRunSql ?? tab?.query ?? ""} />
        </div>
      </div>
      <div className={`flex min-h-0 flex-1 transition-opacity ${isExecuting ? "opacity-50" : ""}`}>
        <div className="min-h-0 min-w-0 flex-1">
          {current.view === "chart" && chartConfig ? (
            <ChartPanel result={result} config={chartConfig} onConfigChange={(chart) => patch({ chart })} />
          ) : activePlugin ? (
            <PluginVisualization extension={activePlugin.extension} pluginName={activePlugin.label} result={result} />
          ) : current.view === "details" ? (
            <DetailsView result={result} sql={sql} at={resultMeta(result).at} />
          ) : (
            <DataTable
              key={resultMeta(result).id}
              result={result}
              filter={current.filter}
              inspectedColumn={inspectedColumn}
              showStats={showStats}
              onInspect={inspect}
              onSelectColumn={(column) => inspectorOpen && patch({ inspectCol: column })}
            />
          )}
        </div>
        {showTable && inspectedColumn && (
          <ColumnStatsPane
            result={result}
            column={inspectedColumn}
            onColumnChange={(column) => patch({ inspectCol: column })}
            onClose={() => setInspectorOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
