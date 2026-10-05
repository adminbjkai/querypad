"use client";

import { useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { runActive } from "@/lib/workspace-actions";
import PeerCursors from "@/components/collaboration/PeerCursors";
import { Icon } from "@/components/ui/icons";
import { MOD, Spinner, btn } from "@/components/ui/primitives";

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

  const commit = () => {
    if (editingId && editValue.trim()) renameTab(editingId, editValue.trim());
    setEditingId(null);
  };

  return (
    <div className="flex h-10 shrink-0 items-stretch border-b border-line bg-raised">
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto" role="tablist" aria-label="Query tabs">
        {tabs.map((tab) => {
          const selected = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={selected}
              tabIndex={0}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => e.key === "Enter" && setActiveTab(tab.id)}
              onDoubleClick={() => {
                setEditingId(tab.id);
                setEditValue(tab.title);
              }}
              onAuxClick={(e) => e.button === 1 && tabs.length > 1 && removeTab(tab.id)}
              className={`group relative flex shrink-0 cursor-pointer select-none items-center gap-1.5 border-r border-line px-3 text-[13px] ${
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
                <span className="max-w-[140px] truncate">{tab.title}</span>
              )}
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTab(tab.id);
                  }}
                  className={`rounded p-0.5 text-faint hover:bg-sunken hover:text-ink ${selected ? "" : "opacity-0 group-hover:opacity-100"}`}
                  aria-label={`Close ${tab.title}`}
                >
                  <Icon name="x" size={12} />
                </button>
              )}
            </div>
          );
        })}
        <button onClick={() => addTab()} className="flex w-9 shrink-0 items-center justify-center text-muted hover:bg-sunken hover:text-ink" title="New tab" aria-label="New tab">
          <Icon name="plus" size={15} />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 px-2">
        {roomId && <PeerCursors />}
        <button
          onClick={() => {
            const ui = useUiStore.getState();
            if (ui.aiOpen) ui.closeAi();
            else ui.openAi();
          }}
          className={`${btn.ghost} ${aiOpen ? "bg-accent-soft text-accent" : ""}`}
          title={`Ask AI (${MOD}+K)`}
          aria-pressed={aiOpen}
        >
          <Icon name="sparkle" size={15} />
          <span className="hidden sm:inline">Ask AI</span>
        </button>
        <button
          onClick={runActive}
          disabled={!active?.query.trim() || active?.isExecuting}
          className={btn.primary}
          title={`Run (${MOD}+Enter). Runs only the selection if you have one.`}
        >
          {active?.isExecuting ? <Spinner className="size-3" /> : <Icon name="play" size={13} className="fill-current" />}
          Run
          <span className="hidden text-[11px] opacity-70 lg:inline">{MOD}↵</span>
        </button>
      </div>
    </div>
  );
}
