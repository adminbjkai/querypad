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
import { Spinner, btn } from "@/components/ui/primitives";

function columnsOf(tables: TableInfo[], table: string): string[] {
  return tables.find((t) => t.name === table)?.columns.map((c) => c.name) ?? [];
}

const select =
  "min-w-0 flex-1 rounded-md border border-line bg-surface px-1.5 py-1 font-mono text-[12px] text-ink outline-none focus:border-accent";

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
    verdict === "accepted" ? "border-ok/50 bg-ok-soft/40" : verdict === "rejected" ? "border-line opacity-55" : "border-line";

  return (
    <li className={`rounded-lg border bg-surface px-2.5 py-2 ${tone}`}>
      <p className={`font-mono text-[12px] leading-[18px] text-ink [overflow-wrap:anywhere] ${verdict === "rejected" ? "line-through" : ""}`}>
        <span className="block">{rel.from.table}.{rel.from.column}</span>
        <span className="block">
          <span className="pr-1 text-join">↳</span>
          {rel.to.table}.{rel.to.column}
        </span>
      </p>
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
        <span className="relative h-1 w-14 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
          <span className="absolute inset-y-0 left-0 rounded-full bg-join" style={{ width: `${rel.confidence}%` }} />
        </span>
        <span className="font-medium tabular-nums text-ink">{rel.confidence}%</span>
        <span>{rel.cardinality}</span>
        {edited && <span className="text-accent">edited</span>}
        {verdict === "accepted" && <span className="ml-auto text-ok">accepted</span>}
      </div>

      {editing ? (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-1 text-[12px]">
            <span className="font-mono text-muted">{rel.from.table}.</span>
            <select value={fromColumn} onChange={(e) => setFromColumn(e.target.value)} className={select} aria-label="Foreign column">
              {columnsOf(tables, rel.from.table).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1 text-[12px]">
            <span className="text-join">↳</span>
            <select
              value={toTable}
              onChange={(e) => {
                setToTable(e.target.value);
                setToColumn(columnsOf(tables, e.target.value)[0] ?? "");
              }}
              className={select}
              aria-label="Referenced table"
            >
              {tableNames.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select value={toColumn} onChange={(e) => setToColumn(e.target.value)} className={select} aria-label="Referenced column">
              {columnsOf(tables, toTable).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
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
            <ul className="mt-2 space-y-1 border-l-2 border-join/40 pl-2 text-[12px] leading-[17px] text-muted">
              {reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-0.5">
            <button
              onClick={() => onVerdict(verdict === "accepted" ? null : "accepted")}
              className={`h-6 rounded px-2 text-[12px] font-medium ${verdict === "accepted" ? "bg-ok text-surface" : "text-ok hover:bg-ok-soft"}`}
            >
              Accept
            </button>
            <button
              onClick={() => onVerdict(verdict === "rejected" ? null : "rejected")}
              className={`h-6 rounded px-2 text-[12px] font-medium ${verdict === "rejected" ? "bg-muted text-surface" : "text-muted hover:bg-sunken"}`}
            >
              Reject
            </button>
            <button
              onClick={() => {
                setFromColumn(rel.from.column);
                setToTable(rel.to.table);
                setToColumn(rel.to.column);
                setEditing(true);
              }}
              className="h-6 rounded px-2 text-[12px] text-muted hover:bg-sunken hover:text-ink"
            >
              Edit
            </button>
            <button
              onClick={() => {
                if (!insertAtCursor(`${joinClause(rel)}\n`)) toast("Open the SQL editor to insert the join.", "info");
              }}
              className="h-6 rounded px-2 text-[12px] text-muted hover:bg-sunken hover:text-ink"
              title={joinClause(rel)}
            >
              Insert JOIN
            </button>
            <button onClick={() => setExpanded((v) => !v)} className="ml-auto h-6 rounded px-2 text-[12px] text-muted hover:bg-sunken hover:text-ink">
              {expanded ? "Hide" : "Why?"}
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
      <div className="flex items-start gap-2 px-3 pb-2 pt-2.5">
        <h2 className="sr-only">Relationships</h2>
        <p className="flex-1 text-[12px] leading-[17px] text-muted">
          {discovery.status === "ready"
            ? sorted.length > 0
              ? `${sorted.length} inferred from your data. Accept the right ones — AI uses them for joins.`
              : "No joins found yet."
            : "Finding joins by comparing key values across tables…"}
        </p>
        <button
          onClick={() => void discoverRelationships()}
          disabled={discovery.status === "loading"}
          className={btn.icon}
          title="Discover again"
          aria-label="Re-discover relationships"
        >
          <Icon name="refresh" size={14} />
        </button>
      </div>
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
          <p className="px-1 py-3 text-[13px] leading-5 text-muted">
            Load at least two tables that share a key — for example orders.customer_id and customers.id.
          </p>
        )}
        {discovery.status === "ready" && sorted.length > 0 && (
          <ul className="space-y-2">
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
