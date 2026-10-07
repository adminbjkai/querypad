"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { saveCurrentAsSnippet } from "@/stores/snippet-store";
import { useUiStore } from "@/stores/ui-store";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { runActive } from "@/lib/workspace-actions";
import { formatSql } from "./format-sql";
import PeerCursors from "@/components/collaboration/PeerCursors";
import { Icon } from "@/components/ui/icons";
import { MOD, Spinner, btn, kbdOnAccent } from "@/components/ui/primitives";

/**
 * Query tabs plus the editor tools. The tab list scrolls sideways (hidden scrollbar, wheel
 * scrolls it horizontally, the active tab is kept in view); the tools stay pinned on the right
 * and shed their labels below container widths so they never overlap the tabs.
 */
export default function TabBar() {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const addTab = useWorkspaceStore((s) => s.addTab);
  const removeTab = useWorkspaceStore((s) => s.removeTab);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const renameTab = useWorkspaceStore((s) => s.renameTab);
  const active = tabs.find((t) => t.id === activeTabId);
  const aiOpen = useUiStore((s) => s.aiOpen);
  const roomId = useCollaborationStore((s) => s.roomId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the active tab visible when it changes (new tab, keyboard navigation, restore).
  useEffect(() => {
    document.getElementById(`query-tab-${activeTabId}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId, tabs.length]);

  const commit = () => {
    if (editingId && editValue.trim()) renameTab(editingId, editValue.trim());
    setEditingId(null);
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
              onDoubleClick={() => {
                setEditingId(tab.id);
                setEditValue(tab.title);
              }}
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
                <span className="min-w-0 flex-1 truncate">{tab.title}</span>
              )}
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTab(tab.id);
                  }}
                  className={`shrink-0 rounded p-0.5 text-faint hover:bg-sunken hover:text-ink focus-visible:opacity-100 ${selected ? "" : "opacity-0 group-hover:opacity-100"}`}
                  aria-label={`Close ${tab.title}`}
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

      <div className="flex shrink-0 items-center gap-2 border-l border-line bg-chrome px-2">
        {roomId && <PeerCursors />}
        <div className="flex items-center">
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
          disabled={!active?.query.trim() || active?.isExecuting}
          className={btn.primary}
          title={`Run (${MOD}+Enter). Runs only the selection if you have one.`}
        >
          {active?.isExecuting ? <Spinner className="size-3" /> : <Icon name="play" size={14} className="fill-current" />}
          Run
          <span className={`${kbdOnAccent} hidden @min-[560px]:inline-flex`} aria-hidden="true">
            {MOD}↵
          </span>
        </button>
      </div>
    </div>
  );
}
