"use client";

import { useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useSnippetStore } from "@/stores/snippet-store";
import { useUiStore } from "@/stores/ui-store";
import { openSavedQueryInWorkbench, openSnippet } from "@/lib/workspace-actions";
import { Icon } from "@/components/ui/icons";
import { Tabs } from "@/components/ui/primitives";
import DatasetList from "./DatasetList";
import { relativeTime } from "./format";

const TABS = ["Datasets", "Queries", "Folders", "Notebooks", "Snippets", "Spaces"] as const;
type Tab = (typeof TABS)[number];

const rowBtn =
  "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";

function Empty({ children }: { children: string }) {
  return <p className="px-5 py-8 text-center text-[13px] text-muted">{children}</p>;
}

function Queries() {
  const history = useWorkspaceStore((s) => s.history);
  const savedQueries = useWorkspaceStore((s) => s.savedQueries);
  const folders = useWorkspaceStore((s) => s.folders);
  if (history.length === 0 && savedQueries.length === 0) return <Empty>Queries you save or run will appear here.</Empty>;
  const saved = [...savedQueries].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  return (
    <ul className="divide-y divide-line">
      {saved.map((q) => {
        const folder = q.folderId ? folders.find((f) => f.id === q.folderId)?.name : undefined;
        return (
          <li key={q.id}>
            <button className={rowBtn} onClick={() => openSavedQueryInWorkbench(q.id)} title="Open the saved query" aria-label={`Saved query ${q.name}`}>
              <Icon name="bookmark" size={14} className="fill-current text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink">{q.name}</span>
                <span className="block truncate font-mono text-[11px] text-muted">{q.sql.replace(/\s+/g, " ") || "Empty query"}</span>
              </span>
              {folder && <span className="hidden shrink-0 truncate text-[11px] text-faint sm:inline">{folder}</span>}
              <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-faint">{relativeTime(q.updatedAt)}</span>
            </button>
          </li>
        );
      })}
      {history.slice(0, Math.max(3, 8 - saved.length)).map((h) => (
        <li key={h.id}>
          <button className={rowBtn} onClick={() => openSnippet(h.sql, "From history")} title="Open SQL in a new tab">
            <Icon name={h.error ? "alert" : "check"} size={14} className={h.error ? "text-danger" : "text-ok"} />
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{h.sql.replace(/\s+/g, " ")}</span>
            <span className="hidden shrink-0 text-[11px] tabular-nums text-muted sm:inline">
              {h.error ? "Failed" : `${h.rowCount?.toLocaleString() ?? 0} rows · ${h.ms.toLocaleString()} ms`}
            </span>
            <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-faint">{relativeTime(h.at)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Snippets() {
  const snippets = useSnippetStore((s) => s.snippets);
  if (snippets.length === 0) return <Empty>Saved snippets will appear here.</Empty>;
  const sorted = [...snippets].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  return (
    <ul className="divide-y divide-line">
      {sorted.map((sn) => (
        <li key={sn.id}>
          <button className={rowBtn} onClick={() => openSnippet(sn.sql, sn.name)} title="Open SQL in a new tab">
            <Icon name="bookmark" size={14} className="text-faint" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-ink">{sn.name}</span>
              {sn.description && <span className="block truncate text-[11px] text-muted">{sn.description}</span>}
            </span>
            {sn.folder && <span className="shrink-0 truncate text-[11px] text-faint">{sn.folder}</span>}
            <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-faint">{relativeTime(sn.updatedAt)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Folders() {
  const folders = useWorkspaceStore((s) => s.folders);
  const savedQueries = useWorkspaceStore((s) => s.savedQueries);
  const notebooks = useWorkspaceStore((s) => s.notebooks);
  if (folders.length === 0) return <Empty>Folders you create for saved queries and notebooks will appear here.</Empty>;
  const sorted = [...folders].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  return (
    <ul className="divide-y divide-line">
      {sorted.map((f) => {
        const queries = savedQueries.filter((q) => q.folderId === f.id).length;
        const nbs = notebooks.filter((n) => n.folderId === f.id).length;
        return (
          <li key={f.id}>
            <button className={rowBtn} onClick={() => useUiStore.getState().openFolder(f.id)} title="Open the folder" aria-label={`Folder ${f.name}`}>
              <Icon name="folder" size={14} className="text-accent" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{f.name}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-faint">
                {queries} {queries === 1 ? "query" : "queries"} · {nbs} {nbs === 1 ? "notebook" : "notebooks"}
              </span>
              <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-faint">{relativeTime(f.updatedAt)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Notebooks() {
  const notebooks = useWorkspaceStore((s) => s.notebooks);
  const folders = useWorkspaceStore((s) => s.folders);
  if (notebooks.length === 0) return <Empty>Notebooks will appear here.</Empty>;
  const sorted = [...notebooks].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  return (
    <ul className="divide-y divide-line">
      {sorted.map((n) => {
        const folder = n.folderId ? folders.find((f) => f.id === n.folderId)?.name : undefined;
        return (
          <li key={n.id}>
            <button className={rowBtn} onClick={() => useUiStore.getState().openNotebook(n.id)} title="Open the notebook" aria-label={`Notebook ${n.name}`}>
              <Icon name="notebook" size={14} className="text-muted" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{n.name}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-faint">{n.cells.length} {n.cells.length === 1 ? "cell" : "cells"}</span>
              {folder && <span className="hidden shrink-0 truncate text-[11px] text-faint sm:inline">{folder}</span>}
              <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-faint">{relativeTime(n.updatedAt)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Spaces() {
  const spaces = useWorkspaceStore((s) => s.spaces);
  const spaceId = useWorkspaceStore((s) => s.spaceId);
  const switchSpace = useWorkspaceStore((s) => s.switchSpace);
  const others = [...spaces].filter((s) => s.id !== spaceId).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  if (others.length === 0) return <Empty>Your other spaces will appear here.</Empty>;
  return (
    <ul className="divide-y divide-line">
      {others.map((s) => (
        <li key={s.id}>
          <button className={rowBtn} onClick={() => void switchSpace(s.id)}>
            <Icon name="folder" size={14} className="text-faint" />
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{s.name}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-faint">{s.tableCount} {s.tableCount === 1 ? "table" : "tables"}</span>
            <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-faint">{relativeTime(s.updatedAt)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function RecentTabs() {
  const [tab, setTab] = useState<Tab>("Datasets");

  return (
    <section aria-label="Recent" className="mt-8">
      <h2 className="mb-2 text-[14px] font-semibold leading-5 text-ink">Recent</h2>
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <Tabs value={tab} onChange={(v) => setTab(v as Tab)} ariaLabel="Recent" className="px-3" tabs={TABS.map((t) => ({ value: t, label: t }))} />
        <div role="tabpanel" aria-label={tab}>
          {tab === "Datasets" ? (
            <DatasetList />
          ) : tab === "Queries" ? (
            <Queries />
          ) : tab === "Folders" ? (
            <Folders />
          ) : tab === "Notebooks" ? (
            <Notebooks />
          ) : tab === "Snippets" ? (
            <Snippets />
          ) : (
            <Spaces />
          )}
        </div>
      </div>
    </section>
  );
}
