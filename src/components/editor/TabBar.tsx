"use client";

import { useEffect, useRef, useState } from "react";
import { selectEngineReady, useWorkspaceStore } from "@/stores/workspace-store";
import { saveCurrentAsSnippet } from "@/stores/snippet-store";
import { useUiStore } from "@/stores/ui-store";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { runActive } from "@/lib/workspace-actions";
import { formatSql } from "./format-sql";
import SaveQueryButton from "./SaveQueryButton";
import PeerCursors from "@/components/collaboration/PeerCursors";
import ConfirmDialog from "@/components/library/ConfirmDialog";
import MoveToFolderDialog from "@/components/library/MoveToFolderDialog";
import { openSaveQueryDialog } from "@/components/library/SaveQueryDialog";
import { Icon } from "@/components/ui/icons";
import { MOD, Menu, Spinner, btn, kbdOnAccent } from "@/components/ui/primitives";
import type { SavedQuery } from "@/types";

/**
 * Query tabs plus the editor tools. The tab list scrolls sideways (hidden scrollbar, wheel
 * scrolls it horizontally, the active tab is kept in view); the tools stay pinned on the right
 * and shed their labels below container widths so they never overlap the tabs.
 */
export default function TabBar() {
  const ready = useWorkspaceStore(selectEngineReady);
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const addTab = useWorkspaceStore((s) => s.addTab);
  const removeTab = useWorkspaceStore((s) => s.removeTab);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const renameTab = useWorkspaceStore((s) => s.renameTab);
  const savedQueries = useWorkspaceStore((s) => s.savedQueries);
  const active = tabs.find((t) => t.id === activeTabId);
  const savedFor = (tab: { savedQueryId?: string | null }): SavedQuery | undefined =>
    tab.savedQueryId ? savedQueries.find((q) => q.id === tab.savedQueryId) : undefined;
  const aiOpen = useUiStore((s) => s.aiOpen);
  const roomId = useCollaborationStore((s) => s.roomId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [moving, setMoving] = useState<SavedQuery | null>(null);
  const [unsaving, setUnsaving] = useState<SavedQuery | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the active tab visible when it changes (new tab, keyboard navigation, restore).
  useEffect(() => {
    document.getElementById(`query-tab-${activeTabId}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId, tabs.length]);

  // Renaming a saved tab renames the library entry too, so the tab and the folder agree.
  const commit = () => {
    const name = editValue.trim();
    if (editingId && name) {
      renameTab(editingId, name);
      const saved = savedFor(tabs.find((t) => t.id === editingId) ?? {});
      if (saved) useWorkspaceStore.getState().renameSavedQuery(saved.id, name);
    }
    setEditingId(null);
  };
  const startRename = (tab: { id: string; title: string; savedQueryId?: string | null }) => {
    setEditingId(tab.id);
    setEditValue(savedFor(tab)?.name ?? tab.title);
  };

  return (
    <div className="@container flex h-9 shrink-0 items-stretch border-b border-line bg-chrome">
      <div
        ref={listRef}
        className="qp-tabstrip flex min-w-0 flex-1 items-stretch"
        role="tablist"
        aria-label="Query tabs"
        onWheel={(e) => {
          // A plain vertical wheel over the strip scrolls it sideways (the strip never scrolls vertically).
          if (e.deltaY !== 0 && e.deltaX === 0) listRef.current?.scrollBy({ left: e.deltaY });
        }}
      >
        {tabs.map((tab) => {
          const selected = tab.id === activeTabId;
          const saved = savedFor(tab);
          const title = saved?.name ?? tab.title;
          const dirty = !!saved && saved.sql !== tab.query;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveTab(tab.id);
                  return;
                }
                const index = tabs.findIndex((item) => item.id === tab.id);
                const nextIndex = e.key === "ArrowRight" ? (index + 1) % tabs.length : e.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
                if (nextIndex >= 0) {
                  e.preventDefault();
                  const next = tabs[nextIndex];
                  setActiveTab(next.id);
                  requestAnimationFrame(() => document.getElementById(`query-tab-${next.id}`)?.focus());
                }
              }}
              id={`query-tab-${tab.id}`}
              onDoubleClick={() => startRename(tab)}
              onAuxClick={(e) => e.button === 1 && tabs.length > 1 && removeTab(tab.id)}
              className={`group relative flex min-w-[88px] max-w-[180px] shrink cursor-pointer select-none items-center gap-1.5 border-r border-line px-3 text-[13px] ${
                selected ? "bg-surface text-ink" : "text-muted hover:bg-sunken hover:text-ink"
              }`}
            >
              {selected && <span className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
              {tab.isExecuting ? (
                <Spinner className="size-3 text-accent" />
              ) : tab.error ? (
                <span className="size-1.5 rounded-full bg-danger" title="Last run failed" />
              ) : tab.result ? (
                <span className="size-1.5 rounded-full bg-ok" title="Has results" />
              ) : null}
              {saved && (
                <Icon name="bookmark" size={12} className="shrink-0 fill-current text-accent" aria-label="Saved query" />
              )}
              {editingId === tab.id ? (
                <input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-28 rounded border border-accent bg-surface px-1 text-[13px] text-ink outline-none"
                  autoFocus
                  aria-label="Tab name"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate" title={dirty ? `${title} — unsaved changes` : title}>
                  {title}
                </span>
              )}
              {dirty && <span className="size-1.5 shrink-0 rounded-full bg-warn" title="Unsaved changes" aria-label="Unsaved changes" />}
              {selected && (
                <Menu
                  label={`Tab ${title}`}
                  trigger={({ toggle }) => (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle();
                      }}
                      onDoubleClick={(e) => e.stopPropagation()}
                      className="shrink-0 rounded p-0.5 text-faint hover:bg-sunken hover:text-ink"
                      aria-label={`Options for ${title}`}
                      title="Tab options"
                    >
                      <Icon name="more" size={14} />
                    </button>
                  )}
                  items={[
                    { label: "Rename…", icon: "edit", onSelect: () => startRename(tab) },
                    ...(saved
                      ? [
                          { label: "Move to folder…", icon: "folder" as const, onSelect: () => setMoving(saved) },
                          { label: "Remove from saved", icon: "trash" as const, danger: true, onSelect: () => setUnsaving(saved) },
                        ]
                      : [{ label: "Save query…", icon: "bookmark" as const, hint: `${MOD}+S`, onSelect: () => openSaveQueryDialog(tab.id) }]),
                  ]}
                />
              )}
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTab(tab.id);
                  }}
                  className={`shrink-0 rounded p-0.5 text-faint hover:bg-sunken hover:text-ink focus-visible:opacity-100 ${selected ? "" : "opacity-0 group-hover:opacity-100"}`}
                  aria-label={`Close ${title}`}
                >
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
          );
        })}
        <button onClick={() => addTab()} className="flex w-9 shrink-0 items-center justify-center text-muted hover:bg-sunken hover:text-ink" title="New tab" aria-label="New tab">
          <Icon name="plus" size={16} />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-l border-line bg-chrome px-2" role="toolbar" aria-label="Editor tools">
        {roomId && <PeerCursors />}
        <div className="flex items-center">
          <SaveQueryButton />
          <button
            onClick={() => void formatSql()}
            disabled={!active?.query.trim()}
            className={btn.icon}
            title="Format SQL (Shift+Alt+F)"
            aria-label="Format SQL"
          >
            <Icon name="format" size={16} />
          </button>
          <button
            onClick={() => void saveCurrentAsSnippet()}
            disabled={!active?.query.trim()}
            className={btn.icon}
            title={`Save as snippet (${MOD}+Shift+S)`}
            aria-label="Save as snippet"
          >
            <Icon name="bookmark" size={16} />
          </button>
        </div>
        <span className="h-4 w-px bg-line" aria-hidden="true" />
        <button
          onClick={() => {
            const ui = useUiStore.getState();
            if (ui.aiOpen) ui.closeAi();
            else ui.openAi();
          }}
          className={`${btn.ghost} ${aiOpen ? "bg-accent-soft text-accent" : ""}`}
          title={`Ask AI (${MOD}+K)`}
          aria-label="Ask AI"
          aria-pressed={aiOpen}
        >
          <Icon name="sparkle" size={16} />
          <span className="hidden @min-[480px]:inline">Ask AI</span>
        </button>
        <button
          onClick={runActive}
          disabled={!ready || !active?.query.trim() || active?.isExecuting}
          className={btn.primary}
          title={!ready ? "Engine starting…" : `Run (${MOD}+Enter). Runs only the selection if you have one.`}
        >
          {active?.isExecuting ? <Spinner className="size-3" /> : <Icon name="play" size={14} className="fill-current" />}
          Run
          <span className={`${kbdOnAccent} hidden @min-[560px]:inline-flex`} aria-hidden="true">
            {MOD}↵
          </span>
        </button>
      </div>
      {moving && (
        <MoveToFolderDialog
          name={moving.name}
          current={moving.folderId}
          onMove={(folderId) => useWorkspaceStore.getState().moveSavedQuery(moving.id, folderId)}
          onClose={() => setMoving(null)}
        />
      )}
      {unsaving && (
        <ConfirmDialog title="Remove from saved?" action="Remove" onConfirm={() => useWorkspaceStore.getState().deleteSavedQuery(unsaving.id)} onClose={() => setUnsaving(null)}>
          <span className="font-medium text-ink">{unsaving.name}</span> leaves the folder library on every device. This tab keeps its SQL.
        </ConfirmDialog>
      )}
    </div>
  );
}
