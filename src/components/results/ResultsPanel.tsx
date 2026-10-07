"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useShallow } from "zustand/react/shallow";
import dynamic from "next/dynamic";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { MAX_RESULT_ROWS } from "@/lib/duckdb/queries";
import { detectChartConfig, type ChartConfig } from "@/lib/charts/detect";
import type { QueryResult } from "@/types";
import DataTable from "./DataTable";
import ColumnStatsPane from "./ColumnStatsPane";
import ColumnCard from "./ColumnCard";
import ChooseColumnsDialog from "./ChooseColumnsDialog";
import DetailsView from "./DetailsView";
import ExportMenu from "./ExportMenu";
import NextSteps from "./NextSteps";
import QueryDetails from "./QueryDetails";
import { resultMeta } from "./result-meta";
import type { SortState } from "./sort";
import PluginVisualization from "@/components/plugins/PluginVisualization";
import { Icon } from "@/components/ui/icons";
import { Chip, Kbd, MOD, Spinner, Tabs, btn } from "@/components/ui/primitives";

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

const EMPTY_VIEW = {
  result: null,
  view: "table" as View,
  filter: "",
  chart: null,
  inspectCol: null,
  sort: null as SortState,
  hidden: [] as string[],
  card: null as { column: string; anchor: HTMLElement } | null,
};

/** Focusable id of the error card, so the status bar can bring it into view. */
export const RESULTS_ERROR_ID = "results-error";

export default function ResultsPanel() {
  // Only the fields this panel renders, as primitives/stable references: the active tab object changes on
  // every keystroke in the editor (its `query` lives in the same record), which must not re-render the grid.
  const { result, error, isExecuting, sql } = useWorkspaceStore(
    useShallow((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      return {
        result: tab?.result ?? null,
        error: tab?.error ?? null,
        isExecuting: tab?.isExecuting ?? false,
        sql: tab?.lastRunSql ?? "",
      };
    })
  );
  const plugins = useWorkspaceStore((s) => s.plugins);
  const opening = useWorkspaceStore((s) => !s._hydrated);
  const openAi = useUiStore((s) => s.openAi);
  // Header distributions: an explicit choice is remembered, otherwise on for results of up to 50 columns.
  const statsPref = useSyncExternalStore(subscribeStats, readStats, () => null);
  const showStats = statsPref === null ? (result?.columns.length ?? 0) <= 50 : statsPref === "1";
  const toggleStats = useCallback(() => {
    try {
      localStorage.setItem(STATS_KEY, showStats ? "0" : "1");
    } catch {}
    window.dispatchEvent(new Event(STATS_EVENT));
  }, [showStats]);

  // View/filter/chart choices reset whenever a new result arrives.
  const [viewState, setViewState] = useState<{
    result: QueryResult | null;
    view: View;
    filter: string;
    chart: ChartConfig | null;
    inspectCol: string | null;
    /** Grid sort (shown as a chip in the toolbar). */
    sort: SortState;
    /** Columns hidden through "Choose columns" (grid and exports), for this result only. */
    hidden: string[];
    /** The open column card and the header block it is anchored to. */
    card: { column: string; anchor: HTMLElement } | null;
  }>(EMPTY_VIEW);
  const current = viewState.result === result ? viewState : { ...EMPTY_VIEW, result };
  const patch = useCallback(
    (next: Partial<typeof viewState>) => setViewState((v) => ({ ...(v.result === result ? v : EMPTY_VIEW), ...next, result })),
    [result]
  );
  // The inspector drawer stays open across re-runs; its column falls back to the first one.
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const inspect = useCallback(
    (column: string) => {
      setInspectorOpen(true);
      patch({ inspectCol: column });
    },
    [patch]
  );
  const followSelection = useCallback((column: string) => inspectorOpen && patch({ inspectCol: column }), [inspectorOpen, patch]);
  const openCard = useCallback((column: string, anchor: HTMLElement) => patch({ card: { column, anchor } }), [patch]);
  const setSort = useCallback((sort: SortState) => patch({ sort }), [patch]);
  // Toolbar popovers and the column chooser are session UI, not part of the result's view state.
  const [detailsAnchor, setDetailsAnchor] = useState<HTMLElement | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);

  // The grid, inspector and exports see only the chosen columns. Rows are projected too (only
  // while columns are hidden), so exporters that read row keys (Excel, plugins) match the grid.
  const hidden = current.hidden;
  const visibleResult = useMemo(() => {
    if (!result || hidden.length === 0) return result;
    const keep = result.columns.map((c, i) => [c, i] as const).filter(([c]) => !hidden.includes(c));
    const columns = keep.map(([c]) => c);
    return {
      ...result,
      columns,
      columnTypes: keep.map(([, i]) => result.columnTypes[i]),
      rows: result.rows.map((row) => Object.fromEntries(columns.map((c) => [c, row[c]]))),
    };
  }, [result, hidden]);
  const inspectedColumn =
    visibleResult && inspectorOpen
      ? current.inspectCol && visibleResult.columns.includes(current.inspectCol)
        ? current.inspectCol
        : visibleResult.columns[0] ?? null
      : null;

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
        <div
          id={RESULTS_ERROR_ID}
          tabIndex={-1}
          className="max-w-3xl rounded-lg border border-line bg-danger-soft p-4 outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <p className="flex items-center gap-2 text-[13px] font-semibold text-danger">
            <Icon name="alert" size={16} />
            The query failed
          </p>
          <p className="mt-1 text-[12px] text-muted">DuckDB could not run this statement. Review the error, then edit and run it again.</p>
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line-soft bg-surface p-3 font-mono text-[12px] leading-5 text-ink">{error.message}</pre>
          <button onClick={() => openAi("Fix the current query so it runs.")} className={`${btn.secondary} mt-3`}>
            <Icon name="wand" size={14} />
            Fix with AI
          </button>
        </div>
      </div>
    );
  }

  if (!result && opening) {
    // The space is still opening: rows at the grid's own size, so nothing moves when it arrives.
    return (
      <div aria-hidden="true" className="flex h-full flex-col bg-surface">
        <div className="flex h-8 items-center gap-6 border-b border-line bg-raised px-4">
          {[18, 12, 16, 10].map((w, i) => (
            <div key={i} className="qp-skeleton h-3" style={{ width: `${w}%` }} />
          ))}
        </div>
        {Array.from({ length: 7 }, (_, r) => (
          <div key={r} className="flex h-7 items-center gap-6 border-b border-line px-4">
            {[18, 12, 16, 10].map((w, i) => (
              <div key={i} className="qp-skeleton h-2.5" style={{ width: `${w - (r % 3)}%` }} />
            ))}
          </div>
        ))}
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
          <div className="flex max-w-md flex-col items-center gap-1">
            <span className="mb-2 flex size-9 items-center justify-center rounded-lg bg-raised text-muted">
              <Icon name="table" size={18} />
            </span>
            <p className="text-[14px] font-medium text-ink">Your query results will appear here</p>
            <p className="text-[13px] text-muted">Run a query, then sort, filter, inspect and export the result.</p>
            <p className="mt-3 flex items-center justify-center gap-1.5 whitespace-nowrap text-[12px] text-muted">
              <Kbd combo={[MOD, "Enter"]} /> Run
              <span aria-hidden="true" className="mx-1 text-faint">·</span>
              <Kbd combo={[MOD, "K"]} /> Ask AI
              <span aria-hidden="true" className="mx-1 text-faint">·</span>
              <Kbd>?</Kbd> Shortcuts
            </p>
          </div>
        )}
      </div>
    );
  }

  const truncated = result.rowCount > result.rows.length;
  const showTable = !(current.view === "chart" && chartConfig) && !activePlugin && current.view !== "details";
  const shown = visibleResult ?? result;

  return (
    <div className="relative flex h-full flex-col bg-surface">
      {scanLine}
      <div className="flex h-9 shrink-0 items-center gap-x-3 border-b border-line bg-chrome pl-1 pr-2">
        <Tabs
          value={current.view}
          onChange={(view) => patch({ view })}
          ariaLabel="Result view"
          className="-mb-px shrink-0"
          tabs={[
            { value: "table", label: "Table" },
            { value: "chart", label: "Chart", disabled: !chartConfig },
            { value: "details", label: "Details" },
            ...pluginViews.map((v) => ({ value: v.key, label: v.label })),
          ]}
        />
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap text-[12px] tabular-nums text-muted">
          <button
            onClick={(e) => {
              const el = e.currentTarget;
              setDetailsAnchor((a) => (a ? null : el));
            }}
            aria-label="Query details"
            aria-expanded={!!detailsAnchor}
            title="Query details: duration, time of the run and the SQL"
            className={`flex h-7 items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              detailsAnchor ? "bg-sunken text-ink" : ""
            }`}
          >
            <span>
              <span className="font-medium text-ink">{result.rowCount.toLocaleString()}</span> {result.rowCount === 1 ? "row" : "rows"}
            </span>
            <span aria-hidden="true" className="text-faint">·</span>
            <span>
              <span className="font-medium text-ink">{shown.columns.length}</span> {shown.columns.length === 1 ? "column" : "columns"}
              {hidden.length > 0 && <span className="text-faint"> of {result.columns.length}</span>}
            </span>
            <span aria-hidden="true" className="hidden text-faint md:inline">·</span>
            <span className="hidden md:inline">{result.executionTimeMs.toLocaleString()} ms</span>
          </button>
          {truncated && (
            <span title={`Only the first ${MAX_RESULT_ROWS.toLocaleString()} rows are loaded into the grid. Parquet export includes all rows.`}>
              <Chip tone="warn">showing first {MAX_RESULT_ROWS.toLocaleString()}</Chip>
            </span>
          )}
          {current.sort && current.view === "table" && (
            <Chip tone="accent" className="gap-1 pr-0.5">
              <span className="font-mono">{current.sort.column}</span> {current.sort.dir.toUpperCase()}
              <button
                onClick={() => setSort(null)}
                aria-label="Clear sort"
                title="Clear sort"
                className="inline-flex size-3.5 items-center justify-center rounded text-accent hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Icon name="x" size={10} />
              </button>
            </Chip>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {current.view === "table" && (
            // A search icon at rest; focusing it (or typing) expands the field in place, Snowsight-style.
            <label className="relative" title="Filter rows">
              <Icon
                name="search"
                size={14}
                className={`pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 ${current.filter ? "text-accent" : "text-muted"}`}
              />
              <input
                value={current.filter}
                onChange={(e) => patch({ filter: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && current.filter) {
                    e.stopPropagation();
                    patch({ filter: "" });
                  }
                }}
                placeholder="Filter rows"
                className={`rounded-md border pl-7 text-ink outline-none transition-[width,background-color,border-color] placeholder:text-faint focus:h-8 focus:w-44 focus:cursor-text focus:border-accent focus:bg-raised focus:pr-2 focus:text-[13px] ${
                  current.filter ? "h-8 w-44 border-line bg-raised pr-2 text-[13px]" : "h-7 w-7 cursor-pointer border-transparent bg-transparent pr-0 text-[12px] hover:bg-sunken"
                }`}
                aria-label="Filter rows"
              />
            </label>
          )}
          {current.view === "table" && result.columns.length > 0 && (
            <button
              onClick={() => setChooserOpen(true)}
              aria-label="Choose columns"
              title={hidden.length > 0 ? `Choose columns (${hidden.length} hidden)` : "Choose columns"}
              className={`${btn.icon} ${hidden.length > 0 ? "text-accent hover:text-accent" : ""}`}
            >
              <Icon name="columns" size={16} />
            </button>
          )}
          {current.view === "table" && result.columns.length > 0 && (
            <button
              onClick={() => (inspectorOpen ? setInspectorOpen(false) : inspect(current.inspectCol ?? shown.columns[0]))}
              aria-pressed={inspectorOpen}
              aria-label="Column inspector"
              title={inspectorOpen ? "Hide column inspector" : "Show column inspector"}
              className={`${btn.icon} ${inspectorOpen ? "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent" : ""}`}
            >
              <Icon name="panelRight" size={16} />
            </button>
          )}
          <NextSteps result={result} sql={sql} />
          <ExportMenu result={shown} query={sql} />
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
              result={shown}
              filter={current.filter}
              inspectedColumn={inspectedColumn}
              showStats={showStats}
              onToggleStats={toggleStats}
              onInspect={inspect}
              onOpenCard={openCard}
              onSelectColumn={followSelection}
              sort={current.sort}
              onSortChange={setSort}
            />
          )}
        </div>
        {showTable && inspectedColumn && (
          <ColumnStatsPane
            result={shown}
            column={inspectedColumn}
            onColumnChange={(column) => patch({ inspectCol: column })}
            onClose={() => setInspectorOpen(false)}
          />
        )}
      </div>
      {current.card && shown.columns.includes(current.card.column) && (
        <ColumnCard
          result={shown}
          column={current.card.column}
          sql={sql}
          anchor={current.card.anchor}
          onFilter={(value) => patch({ filter: value })}
          onInspect={inspect}
          onClose={() => patch({ card: null })}
        />
      )}
      {detailsAnchor && (
        <QueryDetails result={result} sql={sql} at={resultMeta(result).at} anchor={detailsAnchor} onClose={() => setDetailsAnchor(null)} />
      )}
      {chooserOpen && (
        <ChooseColumnsDialog
          result={result}
          hidden={hidden}
          onApply={(next) => {
            setChooserOpen(false);
            patch({
              hidden: next,
              card: null,
              sort: current.sort && next.includes(current.sort.column) ? null : current.sort,
            });
          }}
          onClose={() => setChooserOpen(false)}
        />
      )}
    </div>
  );
}
