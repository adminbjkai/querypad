"use client";

import { useEffect } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { ColumnProfile, TableProfileState } from "@/types";
import { Icon } from "@/components/ui/icons";
import { Chip, KindGlyph, SectionLabel, Spinner, btn } from "@/components/ui/primitives";

const IDLE: TableProfileState = { status: "idle", profile: null, error: null };

function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2 }).format(value);
}

function formatScalar(value: string | number | null): string {
  if (value === null || value === "") return "—";
  if (typeof value === "number") return formatNumber(value);
  return value.length > 32 ? `${value.slice(0, 30)}…` : value;
}

function Meter({ fraction, className }: { fraction: number; className: string }) {
  return (
    <span className="relative block h-1 w-full overflow-hidden rounded-full bg-sunken">
      <span className={`absolute inset-y-0 left-0 rounded-full ${className}`} style={{ width: `${Math.max(2, fraction * 100)}%` }} />
    </span>
  );
}

export function ColumnCard({ column, rowCount }: { column: ColumnProfile; rowCount: number }) {
  const distinct = column.distinctCount;
  const unique = distinct !== null && rowCount > 0 && distinct === rowCount - column.nullCount && column.nullCount === 0;
  return (
    <li className="px-3 py-2.5 transition-colors hover:bg-sunken">
      <div className="flex items-center gap-1">
        <KindGlyph kind={column.kind} type={column.type} />
        <span className="min-w-0 truncate font-mono text-[12px] font-medium text-ink">{column.name}</span>
        {unique && <Chip tone="join">unique</Chip>}
        <span className="ml-auto shrink-0 pl-2 font-mono text-[11px] text-faint">{column.type.toLowerCase()}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular-nums text-muted">
        <span>{column.nullPercent >= 10 ? column.nullPercent.toFixed(0) : column.nullPercent.toFixed(1)}% empty</span>
        <span>{distinct?.toLocaleString() ?? "—"} distinct</span>
        <Meter fraction={column.nullPercent / 100} className="bg-warn" />
        <Meter fraction={distinct !== null && rowCount > 0 ? distinct / rowCount : 0} className="bg-k-text" />
      </div>
      {column.kind === "numeric" && (
        <p className="mt-2 font-mono text-[11px] tabular-nums text-muted">
          {formatScalar(column.min)} to {formatScalar(column.max)}, average {formatNumber(column.avg)}
        </p>
      )}
      {column.kind === "date" && (
        <p className="mt-2 font-mono text-[11px] tabular-nums text-muted">
          {formatScalar(column.min)} to {formatScalar(column.max)}
        </p>
      )}
      {column.topValues.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {column.topValues.map((top) => (
            <li key={top.value} className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-0.5 text-[11px]">
              <span className="truncate font-mono text-ink">{top.value || "(empty)"}</span>
              <span className="tabular-nums text-faint">{top.count.toLocaleString()}</span>
              <span className="col-span-2">
                <Meter fraction={rowCount > 0 ? top.count / rowCount : 0} className="bg-accent" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function ProfileDrawer({ tableName, onClose }: { tableName: string; onClose: () => void }) {
  const table = useWorkspaceStore((s) => s.tables.find((t) => t.name === tableName));
  const state = useWorkspaceStore((s) => s.tableProfiles[tableName]) ?? IDLE;
  const loadTableProfile = useWorkspaceStore((s) => s.loadTableProfile);

  useEffect(() => {
    if (table && state.status === "idle") void loadTableProfile(tableName);
  }, [loadTableProfile, state.status, table, tableName]);

  if (!table) return null;

  return (
    <aside className="flex h-full w-[300px] max-w-[80vw] flex-col border-r border-line bg-surface" aria-label={`${tableName} profile`}>
      <div className="flex shrink-0 items-center gap-1 border-b border-line bg-chrome px-3 py-1.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-mono text-[13px] font-semibold text-ink">{tableName} profile</h2>
          <p className="text-[11px] tabular-nums text-muted">
            {table.rowCount.toLocaleString()} rows × {table.columns.length} columns
          </p>
        </div>
        <button
          onClick={() => void loadTableProfile(tableName)}
          disabled={state.status === "loading"}
          className={btn.icon}
          title="Rebuild profile"
          aria-label={`Refresh profile ${tableName}`}
        >
          <Icon name="refresh" size={14} />
        </button>
        <button onClick={onClose} className={btn.icon} aria-label="Close profile">
          <Icon name="x" size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {state.status === "loading" && (
          <div role="status" aria-label="Profiling columns" className="divide-y divide-line">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2 px-3 py-3">
                <div className="qp-skeleton h-3.5 w-1/2" />
                <div className="qp-skeleton h-2.5 w-full" />
                <div className="qp-skeleton h-2.5 w-3/4" />
              </div>
            ))}
            <p className="flex items-center gap-2 px-3 py-3 text-[12px] text-muted">
              <Spinner className="size-3 text-accent" /> Profiling columns…
            </p>
          </div>
        )}
        {state.status === "error" && (
          <div className="px-3 py-4 text-[13px]">
            <p className="font-medium text-danger">Profiling failed</p>
            <p className="mt-1 whitespace-pre-wrap text-muted">{state.error}</p>
            <button onClick={() => void loadTableProfile(tableName)} className={`${btn.secondary} mt-3`}>
              Try again
            </button>
          </div>
        )}
        {state.status === "ready" && state.profile && (
          <>
            <SectionLabel as="div" className="border-b border-line px-3 py-2" count={state.profile.columns.length}>
              Columns
            </SectionLabel>
            <ul className="divide-y divide-line">
            {state.profile.columns.map((column) => (
              <ColumnCard key={column.name} column={column} rowCount={state.profile!.rowCount} />
            ))}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
