"use client";

import { useEffect, useLayoutEffect, useRef, type SVGProps } from "react";
import { createPortal } from "react-dom";
import type { TableInfo } from "@/types";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { openTablePage, previewTable } from "@/lib/workspace-actions";
import { Icon } from "@/components/ui/icons";
import { Chip, btn } from "@/components/ui/primitives";

/** Pin glyph for the explorer (kept local: the shared icon set is owned elsewhere). */
export function PinIcon({ size = 14, className = "", ...rest }: { size?: number; className?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      {...rest}
    >
      <path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6zM12 15v6" />
    </svg>
  );
}

/** True on devices without a hover pointer (phones, tablets): the card never shows there. */
export function isTouchOnly(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;
}

/** When each table (keyed `spaceId:name`) was first seen this session; the explorer fills it in. */
export const firstSeen = new Map<string, number>();

const WIDTH = 272;
const GAP = 8;

interface TableHoverCardProps {
  table: TableInfo;
  isView?: boolean;
  /** The row the card is anchored to: it opens beside the panel so the row's own hover tray stays reachable. */
  anchor: DOMRect;
  keyColumns: Map<string, "key" | "ref">;
  onClose: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

const KEY_LABEL: Record<string, string> = { primary: "primary key", key: "join key", ref: "references", unique: "unique" };

function formatLoaded(ms: number): string {
  const d = new Date(ms);
  const sameDay = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return sameDay ? time : `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

/** Small anchored summary of a table: shape, source, keys and the two most useful actions. */
export default function TableHoverCard({ table, isView, anchor, keyColumns, onClose, onPointerEnter, onPointerLeave }: TableHoverCardProps) {
  const fileName = useWorkspaceStore((s) => s.fileEntries.find((f) => f.name === table.name)?.fileName);
  const profile = useWorkspaceStore((s) => s.tableProfiles[table.name]);
  const spaceId = useWorkspaceStore((s) => s.spaceId);
  const loadedAt = isView ? undefined : firstSeen.get(`${spaceId}:${table.name}`);
  const ref = useRef<HTMLDivElement>(null);
  // Beside the panel (to the right when it fits, else to the left), never over the row's own tray.
  const fitsRight = anchor.right + GAP + WIDTH <= window.innerWidth - GAP;
  const left = fitsRight ? anchor.right + GAP : Math.max(GAP, anchor.left - GAP - WIDTH);

  // The card's height is only known once it has rendered; keep it inside the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.top = `${Math.max(GAP, Math.min(anchor.top, window.innerHeight - el.offsetHeight - GAP))}px`;
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const unique = new Set<string>();
  if (profile?.status === "ready" && profile.profile && profile.profile.rowCount > 0) {
    for (const c of profile.profile.columns) {
      if (c.nullCount === 0 && c.distinctCount === profile.profile.rowCount) unique.add(c.name);
    }
  }
  const keys = table.columns
    .map((c) => {
      const mark = keyColumns.get(`${table.name}.${c.name}`);
      const kind = mark === "key" && unique.has(c.name) ? "primary" : (mark ?? (unique.has(c.name) ? "unique" : null));
      return kind ? { name: c.name, kind } : null;
    })
    .filter((k): k is { name: string; kind: string } => k !== null);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`${table.name} summary`}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={{ left, top: anchor.top, width: WIDTH }}
      className="qp-pop fixed z-40 rounded-lg border border-line bg-surface p-3 text-[12px] shadow-pop"
    >
      <div className="flex items-center gap-1.5">
        <Icon name={isView ? "code" : "table"} size={14} className="text-accent" />
        <span className="min-w-0 truncate font-mono text-[13px] font-semibold text-ink">{table.name}</span>
        <Chip className="ml-auto">{isView ? "view" : "table"}</Chip>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted">
        <dt className="text-faint">Shape</dt>
        <dd className="tabular-nums text-ink">
          {isView ? "—" : `${table.rowCount.toLocaleString()} ${table.rowCount === 1 ? "row" : "rows"}`} × {table.columns.length}{" "}
          {table.columns.length === 1 ? "column" : "columns"}
        </dd>
        {fileName && (
          <>
            <dt className="text-faint">Source</dt>
            <dd className="truncate font-mono text-ink" title={fileName}>
              {fileName}
            </dd>
          </>
        )}
        {loadedAt !== undefined && (
          <>
            <dt className="text-faint">Loaded</dt>
            <dd className="tabular-nums text-ink">{formatLoaded(loadedAt)}</dd>
          </>
        )}
        <dt className="text-faint">Keys</dt>
        <dd className="flex flex-wrap gap-1">
          {keys.length === 0 && <span className="text-faint">none detected</span>}
          {keys.map((k) => (
            <Chip key={k.name} tone="join" className="gap-1 font-mono">
              <Icon name={k.kind === "ref" ? "join" : "key"} size={12} />
              {k.name}
              <span className="font-sans font-normal">{KEY_LABEL[k.kind]}</span>
            </Chip>
          ))}
        </dd>
      </dl>
      <div className="mt-3 flex gap-1.5">
        <button
          onClick={() => {
            onClose();
            openTablePage(table.name);
          }}
          className={`${btn.secondary} h-7 flex-1 px-2`}
        >
          <Icon name="table" size={14} />
          Open
        </button>
        <button
          onClick={() => {
            onClose();
            previewTable(table.name);
          }}
          className={`${btn.secondary} h-7 flex-1 px-2`}
        >
          <Icon name="play" size={14} />
          Preview
        </button>
      </div>
    </div>,
    document.body
  );
}
