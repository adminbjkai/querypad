"use client";

import { useMemo } from "react";
import type { QueryResult } from "@/types";
import {
  columnShapes,
  type Aggregation,
  type ChartConfig,
  type ChartSort,
  type ChartType,
  type DateBucket,
} from "@/lib/charts/detect";
import { AGG_LABELS, MAX_SERIES } from "@/lib/charts/aggregate";
import { Icon, type IconName } from "@/components/ui/icons";
import { KindGlyph, btn } from "@/components/ui/primitives";

const TYPES: { type: ChartType; label: string; icon: IconName }[] = [
  { type: "bar", label: "Bar", icon: "chart" },
  { type: "hbar", label: "Horizontal bar", icon: "chartHBar" },
  { type: "line", label: "Line", icon: "chartLine" },
  { type: "area", label: "Area", icon: "chartArea" },
  { type: "scatter", label: "Scatter", icon: "chartScatter" },
  { type: "pie", label: "Pie / donut", icon: "chartPie" },
  { type: "scorecard", label: "Scorecard", icon: "chartScorecard" },
];
const BUCKETS: DateBucket[] = ["none", "day", "week", "month", "quarter", "year"];
const SORTS: { value: ChartSort; label: string }[] = [
  { value: "none", label: "Result order" },
  { value: "x-asc", label: "X ascending" },
  { value: "x-desc", label: "X descending" },
  { value: "value-desc", label: "Value descending" },
];
const AGGS = Object.keys(AGG_LABELS) as Aggregation[];

const selectClass =
  "h-7 w-full min-w-0 rounded-md border border-line bg-surface px-1.5 text-[12px] text-ink outline-none focus:border-accent";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-3 py-2.5">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[12px] text-muted">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex items-center gap-2 text-[12px] ${disabled ? "text-faint" : "text-ink"}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="size-3.5 accent-accent" />
      {label}
    </label>
  );
}

/** Snowsight-style "Chart settings" side panel. */
export default function ChartSettings({
  result,
  config,
  onChange,
  onDownload,
}: {
  result: QueryResult;
  config: ChartConfig;
  onChange: (config: ChartConfig) => void;
  onDownload: (() => void) | null;
}) {
  const shapes = useMemo(() => columnShapes(result), [result]);
  const numeric = result.columns.filter((c) => shapes[c] === "number");
  const { type } = config;
  const cartesian = type === "bar" || type === "hbar" || type === "line" || type === "area";
  const stackable = type === "bar" || type === "hbar" || type === "area";
  const xOptions = type === "scatter" ? numeric : result.columns;
  const xIsDate = shapes[config.xColumn] === "date";
  const patch = (next: Partial<ChartConfig>) => onChange({ ...config, ...next });

  const setType = (next: ChartType) => {
    const nextConfig: ChartConfig = { ...config, type: next };
    if (next === "scatter") {
      if (shapes[config.xColumn] !== "number" && numeric[0]) nextConfig.xColumn = numeric[0];
      const y = numeric.find((c) => c !== nextConfig.xColumn) ?? config.series[0]?.column;
      nextConfig.series = y ? [{ column: y, agg: "none" }] : config.series;
    } else if (type === "scatter") {
      nextConfig.series = config.series.map((s) => (s.agg === "none" ? { ...s, agg: "sum" as const } : s));
    }
    if (next === "pie") nextConfig.series = nextConfig.series.slice(0, 1);
    onChange(nextConfig);
  };

  const setSeries = (index: number, next: Partial<ChartConfig["series"][number]>) =>
    patch({ series: config.series.map((s, i) => (i === index ? { ...s, ...next } : s)) });
  const addSeries = () => {
    const used = new Set(config.series.map((s) => s.column));
    const column = numeric.find((c) => !used.has(c) && c !== config.xColumn) ?? numeric[0] ?? result.columns[0];
    patch({ series: [...config.series, { column, agg: "sum" }] });
  };
  const multiSeries = type !== "scatter" && type !== "pie";
  const canGroup = type !== "pie" && type !== "scorecard";

  return (
    <aside aria-label="Chart settings" className="flex h-full w-[260px] shrink-0 flex-col border-l border-line bg-surface">
      <div className="shrink-0 border-b border-line px-3 py-2 text-[13px] font-semibold text-ink">Chart settings</div>
      <div className="min-h-0 flex-1 overflow-auto">
        <Section title="Chart type">
          <div role="radiogroup" aria-label="Chart type" className="grid grid-cols-4 gap-1">
            {TYPES.map((t) => (
              <button
                key={t.type}
                role="radio"
                aria-checked={type === t.type}
                aria-label={t.label}
                title={t.label}
                onClick={() => setType(t.type)}
                className={`flex h-9 items-center justify-center rounded-md border transition-colors ${
                  type === t.type ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-line-strong hover:text-ink"
                }`}
              >
                <Icon name={t.icon} size={17} />
              </button>
            ))}
          </div>
        </Section>

        {type !== "scorecard" && (
          <Section title="X axis">
            <Field label="Column">
              <select
                aria-label="X axis column"
                value={config.xColumn}
                onChange={(e) => patch({ xColumn: e.target.value })}
                className={selectClass}
              >
                {(xOptions.includes(config.xColumn) ? xOptions : [config.xColumn, ...xOptions]).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            {xIsDate && type !== "scatter" && (
              <Field label="Date bucket">
                <select
                  aria-label="Date bucket"
                  value={config.bucket}
                  onChange={(e) => patch({ bucket: e.target.value as DateBucket })}
                  className={`${selectClass} capitalize`}
                >
                  {BUCKETS.map((b) => (
                    <option key={b} value={b}>
                      {b === "none" ? "None" : b[0].toUpperCase() + b.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </Section>
        )}

        <Section title={type === "scorecard" ? "Values" : "Y axis"}>
          {(type === "pie" || type === "scatter" ? config.series.slice(0, 1) : config.series).map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <select
                aria-label={`Series ${i + 1} column`}
                value={s.column}
                onChange={(e) => setSeries(i, { column: e.target.value })}
                className={selectClass}
              >
                {result.columns.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              {type !== "scatter" && (
                <select
                  aria-label={`Series ${i + 1} aggregation`}
                  value={s.agg}
                  onChange={(e) => setSeries(i, { agg: e.target.value as Aggregation })}
                  className={`${selectClass} !w-[92px] shrink-0`}
                >
                  {AGGS.map((a) => (
                    <option key={a} value={a}>
                      {AGG_LABELS[a]}
                    </option>
                  ))}
                </select>
              )}
              {multiSeries && config.series.length > 1 && (
                <button
                  aria-label={`Remove series ${i + 1}`}
                  title="Remove series"
                  onClick={() => patch({ series: config.series.filter((_, j) => j !== i) })}
                  className={btn.icon}
                >
                  <Icon name="x" size={13} />
                </button>
              )}
            </div>
          ))}
          {multiSeries && config.series.length < MAX_SERIES && (
            <button onClick={addSeries} className={`${btn.ghost} !px-1.5 text-accent hover:text-accent`}>
              <Icon name="plus" size={13} />
              Add series
            </button>
          )}
          {canGroup && config.groupBy && config.series.length > 1 && (
            <p className="text-[11px] text-faint">With a color column, only the first series is plotted.</p>
          )}
        </Section>

        {canGroup && (
          <Section title="Group by / color by">
            <select
              aria-label="Group by column"
              value={config.groupBy ?? ""}
              onChange={(e) => patch({ groupBy: e.target.value || null })}
              className={selectClass}
            >
              <option value="">None</option>
              {result.columns
                .filter((c) => c !== config.xColumn)
                .map((c) => (
                  <option key={c}>{c}</option>
                ))}
            </select>
            {config.groupBy && (
              <p className="flex items-center gap-1 text-[11px] text-faint">
                <KindGlyph kind={shapes[config.groupBy] === "number" ? "numeric" : shapes[config.groupBy] === "date" ? "date" : "text"} />
                Top {MAX_SERIES - 1} values, the rest as “Other”.
              </p>
            )}
          </Section>
        )}

        {type !== "scatter" && type !== "scorecard" && (
          <Section title="Sort">
            <select aria-label="Sort" value={config.sort} onChange={(e) => patch({ sort: e.target.value as ChartSort })} className={selectClass}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Section>
        )}

        {type !== "scorecard" && (
          <Section title="Display">
            {stackable && <Check label="Stacked" checked={config.stacked} onChange={(stacked) => patch({ stacked })} />}
            <Check label="Show legend" checked={config.legend} onChange={(legend) => patch({ legend })} />
            {(cartesian || type === "pie") && <Check label="Show labels" checked={config.labels} onChange={(labels) => patch({ labels })} />}
          </Section>
        )}

        <div className="px-3 py-2.5">
          <button onClick={onDownload ?? undefined} disabled={!onDownload} className={`${btn.secondary} w-full`}>
            <Icon name="download" size={14} />
            Download PNG
          </button>
        </div>
      </div>
    </aside>
  );
}
