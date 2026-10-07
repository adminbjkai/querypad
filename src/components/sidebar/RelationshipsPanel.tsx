"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast } from "@/stores/ui-store";
import { relationshipKey } from "@/lib/discovery/relationships";
import { buildExplanation } from "@/lib/discovery/explain";
import { quoteIdent } from "@/lib/duckdb/sql-utils";
import { insertAtCursor } from "@/lib/editor-bridge";
import type { TableInfo } from "@/types";
import type { Relationship, RelationshipVerdict } from "@/types/discovery";
import { Icon } from "@/components/ui/icons";
import PanelHeader from "./PanelHeader";
import { Select, Spinner, btn } from "@/components/ui/primitives";

function columnsOf(tables: TableInfo[], table: string): string[] {
  return tables.find((t) => t.name === table)?.columns.map((c) => c.name) ?? [];
}

// The verdict pair looks like the `Segmented` primitive but stays a pair of toggle buttons:
// a verdict can be cleared by clicking it again, and e2e drives them as buttons.
const verdictBtn =
  "inline-flex h-6 items-center justify-center whitespace-nowrap rounded px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface";
const verdictOn = "bg-surface shadow-sm ring-1 ring-line";

const selectClass = "w-full font-mono [&>span]:flex-1 [&>span]:text-left";

function joinClause(rel: Relationship): string {
  const to = quoteIdent(rel.to.table);
  return `JOIN ${to} ON ${quoteIdent(rel.from.table)}.${quoteIdent(rel.from.column)} = ${to}.${quoteIdent(rel.to.column)}`;
}

interface CardProps {
  rel: Relationship;
  tables: TableInfo[];
  tableNames: string[];
  verdict: RelationshipVerdict | undefined;
  edited: boolean;
  onVerdict: (verdict: RelationshipVerdict | null) => void;
  onEdit: (next: Relationship) => void;
}

function RelationshipCard({ rel, tables, tableNames, verdict, edited, onVerdict, onEdit }: CardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [fromColumn, setFromColumn] = useState(rel.from.column);
  const [toTable, setToTable] = useState(rel.to.table);
  const [toColumn, setToColumn] = useState(rel.to.column);

  const reasons = useMemo(
    () => (expanded ? buildExplanation([rel], tableNames).relationships[0]?.reasons ?? [] : []),
    [expanded, rel, tableNames]
  );

  const tone =
    verdict === "accepted" ? "border-ok/40" : verdict === "rejected" ? "border-line opacity-60" : "border-line";
  const toOptions = (names: string[]) => names.map((n) => ({ value: n, label: n }));

  return (
    <li className={`rounded-lg border bg-surface p-3 text-[13px] ${tone}`}>
      <p className={`font-mono text-[13px] leading-5 text-ink [overflow-wrap:anywhere] ${verdict === "rejected" ? "line-through" : ""}`}>
        <span className="block">{rel.from.table}.{rel.from.column}</span>
        <span className="block">
          <span className="pr-1 text-join">↳</span>
          {rel.to.table}.{rel.to.column}
        </span>
      </p>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
        <span className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
          <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${rel.confidence}%` }} />
        </span>
        <span className="shrink-0 font-medium tabular-nums text-ink">{rel.confidence}%</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-faint">
        <span>{rel.cardinality}</span>
        {rel.evidence === "name" && <span title="This table has no rows yet, so only column names and types were compared">name match</span>}
        {edited && <span className="text-accent">edited</span>}
        {verdict === "accepted" && <span className="ml-auto font-medium text-ok">accepted</span>}
        {verdict === "rejected" && <span className="ml-auto">rejected</span>}
      </div>

      {editing ? (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-1">
            <span className="shrink-0 font-mono text-[12px] text-muted">{rel.from.table}.</span>
            <div className="min-w-0 flex-1">
              <Select value={fromColumn} onChange={setFromColumn} options={toOptions(columnsOf(tables, rel.from.table))} ariaLabel="Foreign column" size="sm" className={selectClass} />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="shrink-0 text-join">↳</span>
            <div className="min-w-0 flex-1">
              <Select
                value={toTable}
                onChange={(t) => {
                  setToTable(t);
                  setToColumn(columnsOf(tables, t)[0] ?? "");
                }}
                options={toOptions(tableNames)}
                ariaLabel="Referenced table"
                size="sm"
                className={selectClass}
              />
            </div>
            <div className="min-w-0 flex-1">
              <Select value={toColumn} onChange={setToColumn} options={toOptions(columnsOf(tables, toTable))} ariaLabel="Referenced column" size="sm" className={selectClass} />
            </div>
          </div>
          <div className="flex gap-1.5 pt-0.5">
            <button
              onClick={() => {
                onEdit({ ...rel, from: { table: rel.from.table, column: fromColumn }, to: { table: toTable, column: toColumn }, confidence: 100 });
                setEditing(false);
              }}
              className={`${btn.primary} h-7`}
            >
              Save join
            </button>
            <button onClick={() => setEditing(false)} className={btn.ghost}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {expanded && reasons.length > 0 && (
            <ul className="mt-2 space-y-1 border-l-2 border-join/40 pl-2 text-[13px] leading-5 text-muted">
              {reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <div className="inline-flex shrink-0 items-center rounded-md bg-raised p-0.5" role="group" aria-label="Verdict">
              <button
                onClick={() => onVerdict(verdict === "accepted" ? null : "accepted")}
                aria-pressed={verdict === "accepted"}
                className={`${verdictBtn} ${verdict === "accepted" ? `${verdictOn} text-ok` : "text-muted hover:text-ok"}`}
              >
                Accept
              </button>
              <button
                onClick={() => onVerdict(verdict === "rejected" ? null : "rejected")}
                aria-pressed={verdict === "rejected"}
                className={`${verdictBtn} ${verdict === "rejected" ? `${verdictOn} text-danger` : "text-muted hover:text-danger"}`}
              >
                Reject
              </button>
            </div>
            <button
              onClick={() => {
                setFromColumn(rel.from.column);
                setToTable(rel.to.table);
                setToColumn(rel.to.column);
                setEditing(true);
              }}
              className={btn.icon}
              title="Edit this join"
              aria-label="Edit"
            >
              <Icon name="edit" size={14} />
            </button>
            <button
              onClick={() => {
                if (!insertAtCursor(`${joinClause(rel)}\n`)) toast("Open the SQL editor to insert the join.", "info");
              }}
              className={btn.icon}
              title={`Insert into the editor: ${joinClause(rel)}`}
              aria-label="Insert JOIN"
            >
              <Icon name="insert" size={14} />
            </button>
            <button onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className={`${btn.ghost} ml-auto text-[12px]`} title="Explain this join">
              Why?
              <Icon name="chevronDown" size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          </div>
        </>
      )}
    </li>
  );
}

export default function RelationshipsPanel() {
  const discovery = useWorkspaceStore((s) => s.discovery);
  const tables = useWorkspaceStore((s) => s.tables);
  const verdicts = useWorkspaceStore((s) => s.relationshipVerdicts);
  const overrides = useWorkspaceStore((s) => s.relationshipOverrides);
  const discoverRelationships = useWorkspaceStore((s) => s.discoverRelationships);
  const setVerdict = useWorkspaceStore((s) => s.setRelationshipVerdict);
  const editRelationship = useWorkspaceStore((s) => s.editRelationship);

  useEffect(() => {
    if (discovery.status === "idle") void discoverRelationships();
  }, [discovery.status, discoverRelationships]);

  const tableNames = useMemo(() => tables.map((t) => t.name), [tables]);
  const overrideKeys = useMemo(() => new Set(overrides.map(relationshipKey)), [overrides]);
  const sorted = useMemo(
    () => [...discovery.relationships].sort((a, b) => b.confidence - a.confidence),
    [discovery.relationships]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Joins" count={discovery.status === "ready" && sorted.length > 0 ? sorted.length : undefined}>
        <button
          onClick={() => void discoverRelationships()}
          disabled={discovery.status === "loading"}
          className={btn.icon}
          title="Discover again"
          aria-label="Re-discover relationships"
        >
          <Icon name="refresh" size={14} />
        </button>
      </PanelHeader>
      {!(discovery.status === "ready" && sorted.length === 0) && (
        <p className="px-3 pb-2 pt-2.5 text-[12px] leading-4 text-muted">
          {discovery.status === "ready"
            ? `${sorted.length} inferred from your data. Accept the right ones — AI uses them for joins.`
            : "Finding joins by comparing key values across tables…"}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {discovery.status === "loading" && (
          <p className="flex items-center gap-2 px-1 py-3 text-[13px] text-muted">
            <Spinner className="size-3.5 text-join" /> Comparing columns…
          </p>
        )}
        {discovery.status === "error" && (
          <div className="px-1 py-3 text-[13px]">
            <p className="font-medium text-danger">Discovery failed</p>
            <p className="mt-1 whitespace-pre-wrap text-muted">{discovery.error}</p>
            <button onClick={() => void discoverRelationships()} className={`${btn.secondary} mt-3`}>
              Try again
            </button>
          </div>
        )}
        {discovery.status === "ready" && sorted.length === 0 && (
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <span className="flex size-9 items-center justify-center rounded-lg bg-raised text-muted">
              <Icon name="join" size={18} />
            </span>
            <p className="mt-3 text-[14px] font-medium text-ink">No joins yet</p>
            <p className="mt-1 text-[13px] leading-5 text-muted">
              Load at least two tables that share a key — for example orders.customer_id and customers.id.
            </p>
          </div>
        )}
        {discovery.status === "ready" && sorted.length > 0 && (
          <ul className="space-y-1.5">
            {sorted.map((rel) => {
              const key = relationshipKey(rel);
              return (
                <RelationshipCard
                  key={key}
                  rel={rel}
                  tables={tables}
                  tableNames={tableNames}
                  verdict={verdicts[key]}
                  edited={overrideKeys.has(key)}
                  onVerdict={(verdict) => setVerdict(key, verdict)}
                  onEdit={(next) => editRelationship(key, next)}
                />
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
