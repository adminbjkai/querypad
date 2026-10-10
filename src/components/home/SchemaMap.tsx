"use client";

import { useMemo } from "react";
import type { ColumnInfo, ProfileColumnKind } from "@/types";
import type { Relationship, RelationshipVerdict } from "@/types/discovery";
import { classifyType, quoteIdent } from "@/lib/duckdb/sql-utils";
import { selectEngineReady, useWorkspaceStore } from "@/stores/workspace-store";
import { relationshipKey } from "@/lib/discovery/relationships";
import { openTablePage } from "@/lib/workspace-actions";
import { layoutMap, NODE_H, NODE_W, type MapObject, type Placed } from "@/lib/schema-map-layout";
import { useUiStore } from "@/stores/ui-store";
import { Icon } from "@/components/ui/icons";

export type { MapObject };

/** Upper bound on drawn objects; the rest are reachable from the Tables page. */
const MAX_NODES = 24;

const KIND_ORDER: ProfileColumnKind[] = ["numeric", "text", "date", "boolean", "other"];
const KIND_FILL: Record<ProfileColumnKind, string> = {
  numeric: "bg-k-num",
  text: "bg-k-text",
  date: "bg-k-date",
  boolean: "bg-k-bool",
  other: "bg-k-other",
};

interface Edge {
  from: Placed;
  to: Placed;
  label: string;
  title: string;
  accepted: boolean;
  /** Column pairs, foreign side first. */
  on: [string, string][];
}

/** Open a new SQL tab joining the two tables on the edge's columns, and run it. */
function queryJoin(edge: Edge): void {
  const a = quoteIdent(edge.from.name);
  const b = quoteIdent(edge.to.name);
  const on = edge.on.map(([f, t]) => `a.${quoteIdent(f)} = b.${quoteIdent(t)}`).join("\n  AND ");
  const ws = useWorkspaceStore.getState();
  if (!selectEngineReady(ws)) return;
  ws.setViewMode("sql");
  if (!ws.addTab(`SELECT *\nFROM ${a} AS a\nJOIN ${b} AS b\n  ON ${on}\nLIMIT 100`)) return;
  useUiStore.getState().setWorkspacePage("workbench");
  void ws.runQuery();
}

function KindStrip({ columns }: { columns: ColumnInfo[] }) {
  const counts = new Map<ProfileColumnKind, number>();
  for (const c of columns) {
    const kind = classifyType(c.type);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  if (columns.length === 0) return <span className="h-1 w-full rounded-full bg-sunken" />;
  return (
    <span className="flex h-1 w-full gap-px overflow-hidden rounded-full" aria-hidden="true">
      {KIND_ORDER.filter((k) => counts.has(k)).map((k) => (
        <span key={k} className={`${KIND_FILL[k]} opacity-80`} style={{ flexGrow: counts.get(k) }} />
      ))}
    </span>
  );
}

/** A curve from the right edge of `a` to the left edge of `b` (or back, when b sits left of a). */
function edgePath(a: Placed, b: Placed): { d: string; mx: number; my: number } {
  const forward = b.x >= a.x;
  const x1 = forward ? a.x + NODE_W : a.x;
  const x2 = forward ? b.x : b.x + NODE_W;
  const y1 = a.y + NODE_H / 2;
  const y2 = b.y + NODE_H / 2;
  const bend = Math.max(36, Math.abs(x2 - x1) / 2);
  const c1 = forward ? x1 + bend : x1 - bend;
  const c2 = forward ? x2 - bend : x2 + bend;
  return { d: `M${x1} ${y1} C${c1} ${y1}, ${c2} ${y2}, ${x2} ${y2}`, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
}

/**
 * The space at a glance: every table and view on graph paper, joined by the relationships
 * QueryPad found. Solid lines are joins you accepted; dashed ones still wait for review.
 */
export default function SchemaMap({
  objects,
  relationships,
  verdicts,
}: {
  objects: MapObject[];
  relationships: Relationship[];
  verdicts: Record<string, RelationshipVerdict>;
}) {
  // Past the cap, joined objects win the places: the map is about how tables connect.
  const shown = useMemo(() => {
    if (objects.length <= MAX_NODES) return objects;
    const joined = new Set(relationships.flatMap((r) => [r.from.table, r.to.table]));
    return [...objects.filter((o) => joined.has(o.name)), ...objects.filter((o) => !joined.has(o.name))].slice(0, MAX_NODES);
  }, [objects, relationships]);
  const hidden = objects.length - shown.length;
  const live = useMemo(() => relationships.filter((r) => verdicts[relationshipKey(r)] !== "rejected"), [relationships, verdicts]);
  const layout = useMemo(() => layoutMap(shown, live), [shown, live]);
  const { width } = layout;
  const height = Math.max(layout.height, 152);
  const placed = useMemo(() => {
    const dy = (height - layout.height) / 2;
    return dy ? layout.placed.map((p) => ({ ...p, y: p.y + dy })) : layout.placed;
  }, [layout, height]);

  const edges = useMemo(() => {
    const at = new Map(placed.map((p) => [p.name, p]));
    const byPair = new Map<string, Edge>();
    for (const r of live) {
      const from = at.get(r.from.table);
      const to = at.get(r.to.table);
      if (!from || !to || from === to) continue;
      // One edge per pair of tables, whichever way the references point.
      const key = [from.name, to.name].sort().join("\u0000");
      const accepted = verdicts[relationshipKey(r)] === "accepted";
      const column = r.from.column === r.to.column ? r.from.column : `${r.from.column} = ${r.to.column}`;
      const title = `${r.from.table}.${r.from.column} references ${r.to.table}.${r.to.column} (${Math.round(r.confidence)}% confidence${accepted ? ", accepted" : ", to review"})`;
      const existing = byPair.get(key);
      if (existing) {
        existing.label = `${existing.label}, ${column}`;
        existing.title = `${existing.title}\n${title}`;
        existing.accepted = existing.accepted && accepted;
        // Column pairs are kept in the edge's own direction (its `from` table first).
        existing.on.push(existing.from === from ? [r.from.column, r.to.column] : [r.to.column, r.from.column]);
      } else {
        byPair.set(key, { from, to, label: column, title, accepted, on: [[r.from.column, r.to.column]] });
      }
    }
    return [...byPair.values()];
  }, [placed, live, verdicts]);

  const pending = live.filter((r) => !verdicts[relationshipKey(r)]).length;

  return (
    <figure aria-label="Schema map" className="m-0">
      <div className="qp-graph relative overflow-x-auto rounded-lg border border-line">
        <div className="relative mx-auto" style={{ width, height }}>
          <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden="true">
            {edges.map((e) => {
              const { d } = edgePath(e.from, e.to);
              return (
                <path
                  key={`${e.from.name}-${e.to.name}`}
                  d={d}
                  fill="none"
                  stroke="var(--join)"
                  strokeWidth={e.accepted ? 1.75 : 1.25}
                  strokeDasharray={e.accepted ? undefined : "5 4"}
                  strokeLinecap="round"
                />
              );
            })}
            {edges.map((e) => {
              const fx = e.to.x >= e.from.x ? e.to.x : e.to.x + NODE_W;
              return <circle key={`dot-${e.from.name}-${e.to.name}`} cx={fx} cy={e.to.y + NODE_H / 2} r={3} fill="var(--join)" />;
            })}
          </svg>
          {edges.map((e) => {
            const { mx, my } = edgePath(e.from, e.to);
            return (
              <button
                key={`label-${e.from.name}-${e.to.name}`}
                onClick={() => queryJoin(e)}
                title={`${e.title}\nClick to query this join`}
                aria-label={`Query ${e.from.name} joined to ${e.to.name}`}
                className="absolute max-w-[160px] -translate-x-1/2 -translate-y-1/2 truncate rounded border border-join/30 bg-join-soft px-1.5 font-mono text-[11px] leading-[18px] text-join transition-colors hover:border-join focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                style={{ left: mx, top: my }}
              >
                {e.label}
              </button>
            );
          })}
          {placed.map((p) => (
            <button
              key={p.name}
              onClick={() => openTablePage(p.name)}
              aria-label={`Open ${p.view ? "view" : "table"} ${p.name}`}
              title={`Open ${p.name}`}
              className="absolute flex flex-col justify-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 text-left shadow-[0_1px_0_var(--line)] transition-[border-color,transform] hover:-translate-y-px hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Icon name={p.view ? "code" : "table"} size={14} className="shrink-0 text-faint" />
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-semibold text-ink">{p.name}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-faint">
                  {p.rowCount === null ? "view" : `${p.rowCount.toLocaleString()} ${p.rowCount === 1 ? "row" : "rows"}`}
                </span>
              </span>
              <KindStrip columns={p.columns} />
            </button>
          ))}
        </div>
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <svg width="22" height="6" aria-hidden="true"><path d="M1 3h20" stroke="var(--join)" strokeWidth="1.75" /></svg>
          Accepted join
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="22" height="6" aria-hidden="true"><path d="M1 3h20" stroke="var(--join)" strokeWidth="1.25" strokeDasharray="5 4" /></svg>
          Found, not reviewed
        </span>
        <span className="text-faint max-sm:hidden">Open a table, or click a join to query it</span>
        {hidden > 0 && (
          <button className="text-accent hover:underline" onClick={() => useUiStore.getState().setWorkspacePage("tables")}>
            {hidden} more on the Tables page
          </button>
        )}
        {pending > 0 && (
          <button className="ml-auto inline-flex items-center gap-1 font-medium text-accent hover:underline" onClick={() => useUiStore.getState().openPanel("joins")}>
            Review {pending} {pending === 1 ? "join" : "joins"}
            <Icon name="chevronRight" size={14} />
          </button>
        )}
      </figcaption>
    </figure>
  );
}
