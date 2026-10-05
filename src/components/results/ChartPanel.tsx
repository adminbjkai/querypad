"use client";

import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { QueryResult } from "@/types";
import type { ChartConfig, ChartType } from "@/lib/charts/detect";

/** Series colors reuse the column-kind hues so charts feel native to the workspace. */
const SERIES = ["var(--accent)", "var(--join)", "var(--k-num)", "var(--k-text)", "var(--k-date)", "var(--k-bool)", "var(--muted)"];
const MAX_CHART_ROWS = 5000;
const CHART_TYPES: ChartType[] = ["bar", "line", "scatter", "pie"];

const axis = { tick: { fontSize: 11, fill: "var(--muted)" }, stroke: "var(--line-strong)" };
const tooltip = {
  contentStyle: {
    background: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--ink)",
  },
  cursor: { fill: "var(--sunken)" },
};

const selectClass =
  "h-7 rounded-md border border-line bg-surface px-1.5 text-[12px] text-ink outline-none focus:border-accent";

const ALL = "__all__";

export default function ChartPanel({
  result,
  config,
  onConfigChange,
}: {
  result: QueryResult;
  config: ChartConfig;
  onConfigChange: (config: ChartConfig) => void;
}) {
  const sampled = result.rows.length > MAX_CHART_ROWS;
  const numericColumns = result.columns.filter((c) => typeof result.rows.find((r) => r[c] != null)?.[c] === "number");
  const data = sampled ? result.rows.slice(0, MAX_CHART_ROWS) : result.rows;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-1.5 text-[12px] text-muted">
        <div className="flex rounded-md bg-sunken p-0.5" role="radiogroup" aria-label="Chart type">
          {CHART_TYPES.map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={config.type === t}
              onClick={() => onConfigChange({ ...config, type: t })}
              className={`h-6 rounded px-2 capitalize ${config.type === t ? "bg-surface font-medium text-ink shadow-sm" : "hover:text-ink"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5">
          X
          <select value={config.xColumn} onChange={(e) => onConfigChange({ ...config, xColumn: e.target.value })} className={selectClass}>
            {result.columns.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          Y
          <select
            value={config.yColumns.length > 1 ? ALL : config.yColumns[0]}
            onChange={(e) =>
              onConfigChange({
                ...config,
                yColumns: e.target.value === ALL ? numericColumns.filter((c) => c !== config.xColumn) : [e.target.value],
              })
            }
            className={selectClass}
          >
            {numericColumns.length > 1 && config.type !== "scatter" && config.type !== "pie" && (
              <option value={ALL}>All number columns</option>
            )}
            {result.columns.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {sampled && <span className="text-warn">plotting the first {MAX_CHART_ROWS.toLocaleString()} rows</span>}
      </div>
      <div className="min-h-0 flex-1 p-3">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(data, config)}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function renderChart(data: Record<string, unknown>[], { type, xColumn, yColumns }: ChartConfig): React.ReactElement {
  const legend = yColumns.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : undefined;
  switch (type) {
    case "bar":
      return (
        <BarChart data={data}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey={xColumn} {...axis} />
          <YAxis {...axis} width={56} />
          <Tooltip {...tooltip} />
          {legend}
          {yColumns.map((col, i) => (
            <Bar key={col} dataKey={col} fill={SERIES[i % SERIES.length]} radius={[3, 3, 0, 0]} maxBarSize={48} />
          ))}
        </BarChart>
      );
    case "line":
      return (
        <LineChart data={data}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey={xColumn} {...axis} />
          <YAxis {...axis} width={56} />
          <Tooltip {...tooltip} cursor={{ stroke: "var(--line-strong)" }} />
          {legend}
          {yColumns.map((col, i) => (
            <Line key={col} type="monotone" dataKey={col} stroke={SERIES[i % SERIES.length]} strokeWidth={2} dot={data.length <= 50} />
          ))}
        </LineChart>
      );
    case "scatter":
      return (
        <ScatterChart>
          <CartesianGrid stroke="var(--line)" />
          <XAxis dataKey={xColumn} name={xColumn} {...axis} type="number" />
          <YAxis dataKey={yColumns[0]} name={yColumns[0]} {...axis} width={56} />
          <Tooltip {...tooltip} cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={data} fill={SERIES[0]} fillOpacity={0.7} />
        </ScatterChart>
      );
    case "pie":
      return (
        <PieChart>
          <Tooltip {...tooltip} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Pie data={data} dataKey={yColumns[0]} nameKey={xColumn} innerRadius="45%" outerRadius="75%" paddingAngle={1} stroke="var(--surface)">
            {data.map((_, i) => (
              <Cell key={i} fill={SERIES[i % SERIES.length]} />
            ))}
          </Pie>
        </PieChart>
      );
  }
}
