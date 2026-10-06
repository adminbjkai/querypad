"use client";

import { useMemo, useRef } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, Pie, PieChart, Cell,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis, ResponsiveContainer,
} from "recharts";
import type { QueryResult } from "@/types";
import type { ChartConfig } from "@/lib/charts/detect";
import { buildChartData, OTHER, SERIES_COLORS, type ChartData } from "@/lib/charts/aggregate";
import { compactNumber, fullNumber } from "@/lib/charts/format";
import { downloadChartPng } from "@/lib/charts/png";
import { toast } from "@/stores/ui-store";
import ChartSettings from "./ChartSettings";

const axis = { tick: { fontSize: 11, fill: "var(--muted)" }, stroke: "var(--line-strong)" };
const tooltip = {
  contentStyle: {
    background: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--ink)",
    boxShadow: "var(--shadow)",
  },
  labelStyle: { color: "var(--ink)", fontWeight: 600 },
  itemStyle: { color: "var(--ink)" },
  cursor: { fill: "var(--sunken)", fillOpacity: 0.6 },
  formatter: (value: unknown) => fullNumber(value),
  isAnimationActive: false,
};
const truncate = (v: unknown, max = 16) => {
  const s = String(v);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
/** Our own legend: themed text, and readable names for screen readers. */
function LegendList({ payload }: { payload?: readonly { value?: unknown; color?: string }[] }) {
  return (
    <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 pt-1 text-[12px] text-muted">
      {payload?.map((entry, i) => (
        <li key={i} className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ background: entry.color }} aria-hidden="true" />
          {String(entry.value ?? "")}
        </li>
      ))}
    </ul>
  );
}

export default function ChartPanel({
  result,
  config,
  onConfigChange,
}: {
  result: QueryResult;
  config: ChartConfig;
  onConfigChange: (config: ChartConfig) => void;
}) {
  const data = useMemo(() => buildChartData(result, config), [result, config]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const hasData = config.type === "scorecard" ? data.cards.length > 0 : config.type === "scatter" ? data.points.some((p) => p.length) : data.rows.length > 0;

  const download = async () => {
    if (!canvasRef.current) return;
    try {
      await downloadChartPng(canvasRef.current, config.legend ? data.series.map((s) => ({ label: s.label, color: s.color })) : []);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not export the chart");
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="qp-chart relative flex min-w-0 flex-1 flex-col">
        {data.note && <p className="shrink-0 px-3 pt-2 text-[11px] text-warn">{data.note}</p>}
        <div ref={canvasRef} className="min-h-0 flex-1 p-3" role="img" aria-label={`${config.type} chart of ${result.rows.length.toLocaleString()} rows`}>
          {!hasData ? (
            <p className="flex h-full items-center justify-center text-[13px] text-muted">Nothing to plot with these settings.</p>
          ) : config.type === "scorecard" ? (
            <Scorecards cards={data.cards} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {renderChart(data, config)}
            </ResponsiveContainer>
          )}
        </div>
      </div>
      <ChartSettings
        result={result}
        config={config}
        onChange={onConfigChange}
        onDownload={config.type === "scorecard" || !hasData ? null : download}
      />
    </div>
  );
}

function Scorecards({ cards }: { cards: ChartData["cards"] }) {
  return (
    <div className="grid h-full content-center gap-3 overflow-auto" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${cards.length > 1 ? 180 : 280}px, 1fr))` }}>
      {cards.map((card, i) => (
        <div key={i} className="rounded-lg border border-line bg-raised px-4 py-5 text-center">
          <p
            className="truncate font-mono text-4xl font-semibold tabular-nums text-ink"
            title={card.value === null ? "no value" : fullNumber(card.value)}
          >
            {card.value === null ? "—" : Math.abs(card.value) >= 1e6 ? compactNumber(card.value) : fullNumber(card.value)}
          </p>
          <p className="mt-1.5 truncate text-[12px] text-muted" title={card.label}>
            {card.label}
          </p>
        </div>
      ))}
    </div>
  );
}

function renderChart(data: ChartData, config: ChartConfig): React.ReactElement {
  const { series, rows } = data;
  const { type, stacked, labels } = config;
  const legend = config.legend && (series.length > 1 || type === "pie") ? <Legend content={<LegendList />} /> : undefined;
  const stackId = stacked ? "stack" : undefined;
  const animate = false;
  const margin = { top: labels ? 16 : 8, right: 16, left: 0, bottom: 4 };
  const valueAxis = <YAxis {...axis} width={48} tickFormatter={compactNumber} />;
  const xAxis = <XAxis dataKey="x" {...axis} tickFormatter={(v) => truncate(v)} minTickGap={12} />;
  const grid = <CartesianGrid stroke="var(--line)" vertical={false} />;
  const labelList = (position: "top" | "right" | "inside") =>
    labels ? <LabelList position={position} formatter={compactNumber} fill="var(--muted)" fontSize={10} /> : null;

  switch (type) {
    case "bar":
      return (
        <BarChart data={rows} margin={margin}>
          {grid}
          {xAxis}
          {valueAxis}
          <Tooltip {...tooltip} />
          {legend}
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} stackId={stackId} maxBarSize={48} isAnimationActive={animate} radius={stacked ? 0 : [3, 3, 0, 0]}>
              {labelList(stacked ? "inside" : "top")}
            </Bar>
          ))}
        </BarChart>
      );
    case "hbar": {
      const labelWidth = Math.min(140, Math.max(56, Math.max(0, ...rows.map((r) => Math.min(String(r.x).length, 22))) * 6.2));
      return (
        <BarChart data={rows} layout="vertical" margin={{ ...margin, left: 4, right: labels ? 36 : 16 }}>
          <CartesianGrid stroke="var(--line)" horizontal={false} />
          <XAxis type="number" {...axis} tickFormatter={compactNumber} />
          <YAxis type="category" dataKey="x" {...axis} width={labelWidth} tickFormatter={(v) => truncate(v, 22)} interval={0} />
          <Tooltip {...tooltip} />
          {legend}
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} stackId={stackId} maxBarSize={28} isAnimationActive={animate} radius={stacked ? 0 : [0, 3, 3, 0]}>
              {labelList(stacked ? "inside" : "right")}
            </Bar>
          ))}
        </BarChart>
      );
    }
    case "line":
      return (
        <LineChart data={rows} margin={margin}>
          {grid}
          {xAxis}
          {valueAxis}
          <Tooltip {...tooltip} cursor={{ stroke: "var(--line-strong)" }} />
          {legend}
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={rows.length <= 50} connectNulls isAnimationActive={animate}>
              {labelList("top")}
            </Line>
          ))}
        </LineChart>
      );
    case "area":
      return (
        <AreaChart data={rows} margin={margin}>
          {grid}
          {xAxis}
          {valueAxis}
          <Tooltip {...tooltip} cursor={{ stroke: "var(--line-strong)" }} />
          {legend}
          {series.map((s) => (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} fill={s.color} fillOpacity={stacked ? 0.55 : 0.2} strokeWidth={2} stackId={stackId} connectNulls isAnimationActive={animate}>
              {labelList("top")}
            </Area>
          ))}
        </AreaChart>
      );
    case "scatter":
      return (
        <ScatterChart margin={margin}>
          <CartesianGrid stroke="var(--line)" />
          <XAxis type="number" dataKey="x" name={config.xColumn} {...axis} tickFormatter={compactNumber} domain={["auto", "auto"]} />
          <YAxis type="number" dataKey="y" name={config.series[0]?.column} {...axis} width={48} tickFormatter={compactNumber} domain={["auto", "auto"]} />
          <Tooltip {...tooltip} cursor={{ strokeDasharray: "3 3", stroke: "var(--line-strong)" }} />
          {legend}
          {series.map((s, i) => (
            <Scatter key={s.key} name={s.label} data={data.points[i]} fill={s.color} fillOpacity={0.7} isAnimationActive={animate} />
          ))}
        </ScatterChart>
      );
    case "pie":
      return (
        <PieChart>
          <Tooltip {...tooltip} />
          {legend}
          <Pie
            data={rows.map((r) => ({ name: String(r.x), value: (r.s0 as number | null) ?? 0 }))}
            dataKey="value"
            nameKey="name"
            innerRadius="45%"
            outerRadius="75%"
            paddingAngle={1}
            stroke="var(--surface)"
            isAnimationActive={animate}
            label={
              labels
                ? ({ x, y, value, textAnchor }: { x?: number; y?: number; value?: number; textAnchor?: string }) => (
                    <text x={x} y={y} textAnchor={textAnchor === "end" || textAnchor === "middle" ? textAnchor : "start"} dominantBaseline="central" fill="var(--muted)" fontSize={11}>
                      {compactNumber(value)}
                    </text>
                  )
                : false
            }
          >
            {rows.map((r, i) => (
              <Cell key={i} fill={r.x === OTHER && i === rows.length - 1 && rows.length >= 12 ? "var(--faint)" : SERIES_COLORS[i % SERIES_COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      );
    default:
      return <></>;
  }
}
