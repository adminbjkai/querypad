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
import { Icon } from "@/components/ui/icons";
import { KindGlyph, SectionLabel, Select, btn } from "@/components/ui/primitives";

const TYPES: { value: ChartType; label: string }[] = [
  { value: "bar", label: "Bar" },
  { value: "hbar", label: "Horizontal bar" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
  { value: "scatter", label: "Scatter" },
  { value: "pie", label: "Pie / donut" },
  { value: "scorecard", label: "Scorecard" },
];
const BUCKETS: { value: DateBucket; label: string }[] = (["none", "day", "week", "month", "quarter", "year"] as DateBucket[]).map((b) => ({
  value: b,
  label: b === "none" ? "None" : b[0].toUpperCase() + b.slice(1),
}));
const SORTS: { value: ChartSort; label: string }[] = [
  { value: "none", label: "Result order" },
  { value: "x-asc", label: "X ascending" },
  { value: "x-desc", label: "X descending" },
  { value: "value-desc", label: "Value descending" },
];
const AGGS = (Object.keys(AGG_LABELS) as Aggregation[]).map((a) => ({ value: a, label: AGG_LABELS[a] }));

const columnOptions = (columns: string[]) => columns.map((c) => ({ value: c, label: c }));

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-3 py-2.5">
      <SectionLabel as="h3" className="mb-1.5">{title}</SectionLabel>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-[12px] text-muted">
      <span className="mb-1 block">{label}</span>
      {children}
    </div>
  );
}

function Check({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex h-7 items-center gap-2 text-[12px] ${disabled ? "text-faint" : "text-ink"}`}>
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
      <div className="flex h-9 shrink-0 items-center border-b border-line bg-chrome px-3 text-[13px] font-semibold text-ink">Chart settings</div>
      <div className="min-h-0 flex-1 overflow-auto">
        <Section title="Chart type">
          <Select value={type} onChange={setType} options={TYPES} ariaLabel="Chart type" size="sm" className="w-full" />
        </Section>

        {type !== "scorecard" && (
          <Section title="X axis">
            <Field label="Column">
              <Select
                ariaLabel="X axis column"
                value={config.xColumn}
                onChange={(xColumn) => patch({ xColumn })}
                options={columnOptions(xOptions.includes(config.xColumn) ? xOptions : [config.xColumn, ...xOptions])}
                size="sm"
                className="w-full"
              />
            </Field>
            {xIsDate && type !== "scatter" && (
              <Field label="Date bucket">
                <Select ariaLabel="Date bucket" value={config.bucket} onChange={(bucket) => patch({ bucket })} options={BUCKETS} size="sm" className="w-full" />
              </Field>
            )}
          </Section>
        )}

        <Section title={type === "scorecard" ? "Values" : "Y axis"}>
          {(type === "pie" || type === "scatter" ? config.series.slice(0, 1) : config.series).map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <Select
                  ariaLabel={`Series ${i + 1} column`}
                  value={s.column}
                  onChange={(column) => setSeries(i, { column })}
                  options={columnOptions(result.columns)}
                  size="sm"
                  className="w-full"
                />
              </div>
              {type !== "scatter" && (
                <div className="w-[92px] shrink-0">
                  <Select
                    ariaLabel={`Series ${i + 1} aggregation`}
                    value={s.agg}
                    onChange={(agg) => setSeries(i, { agg })}
                    options={AGGS}
                    size="sm"
                    align="end"
                    className="w-full"
                  />
                </div>
              )}
              {multiSeries && config.series.length > 1 && (
                <button
                  aria-label={`Remove series ${i + 1}`}
                  title="Remove series"
                  onClick={() => patch({ series: config.series.filter((_, j) => j !== i) })}
                  className={btn.icon}
                >
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
          ))}
          {multiSeries && config.series.length < MAX_SERIES && (
            <button onClick={addSeries} className={`${btn.ghost} !px-1.5 text-accent hover:text-accent`}>
              <Icon name="plus" size={14} />
              Add series
            </button>
          )}
          {canGroup && config.groupBy && config.series.length > 1 && (
            <p className="text-[11px] text-faint">With a color column, only the first series is plotted.</p>
          )}
        </Section>

        {canGroup && (
          <Section title="Group by / color by">
            <Select
              ariaLabel="Group by column"
              value={config.groupBy ?? ""}
              onChange={(groupBy) => patch({ groupBy: groupBy || null })}
              options={[{ value: "", label: "None" }, ...columnOptions(result.columns.filter((c) => c !== config.xColumn))]}
              size="sm"
              className="w-full"
            />
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
            <Select ariaLabel="Sort" value={config.sort} onChange={(sort) => patch({ sort })} options={SORTS} size="sm" className="w-full" />
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
