"use client";

import { useMemo, useState } from "react";
import { useWorkspaceStore, type HistoryEntry } from "@/stores/workspace-store";
import { Icon } from "@/components/ui/icons";
import PanelHeader, { SearchBox } from "./PanelHeader";
import { btn } from "@/components/ui/primitives";

function relativeTime(at: number): string {
  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(at).toLocaleDateString();
}

type Filter = "all" | "ok" | "failed";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ok", label: "Succeeded" },
  { id: "failed", label: "Failed" },
];

export default function HistoryPanel() {
  const history = useWorkspaceStore((s) => s.history);
  const clearHistory = useWorkspaceStore((s) => s.clearHistory);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return history.filter(
      (h) =>
        (filter === "all" || (filter === "failed" ? h.error !== null : h.error === null)) &&
        (!q || h.sql.toLowerCase().includes(q))
    );
  }, [history, query, filter]);

  const open = (entry: HistoryEntry) => {
    const ws = useWorkspaceStore.getState();
    ws.setViewMode("sql");
    const tab = ws.tabs.find((t) => t.id === ws.activeTabId);
    if (tab && !tab.query.trim()) ws.updateTab(tab.id, { query: entry.sql });
    else ws.addTab(entry.sql);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="History" count={history.length > 0 ? `${history.length} ${history.length === 1 ? "query" : "queries"}` : undefined}>
        <button onClick={clearHistory} disabled={history.length === 0} className={btn.ghost}>
          Clear
        </button>
      </PanelHeader>

      {history.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] leading-5 text-muted">
          Queries you run show up here, newest first, so you can reopen or rerun them.
        </p>
      ) : (
        <>
          <SearchBox value={query} onChange={setQuery} placeholder="Search history" label="Search history" />
          <div className="px-3 pb-2">
            <div className="flex rounded-md bg-sunken p-0.5" role="group" aria-label="Filter history">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  aria-pressed={filter === f.id}
                  className={`h-6 flex-1 rounded text-[12px] transition-colors ${
                    filter === f.id ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {visible.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-muted">No queries match.</p>}
          <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
            {visible.map((entry) => (
              <li key={entry.id} className="group/h relative">
                <button onClick={() => open(entry)} className="w-full rounded-md px-2 py-2 text-left hover:bg-raised" title="Open in editor">
                  <code className="line-clamp-2 break-all font-mono text-[12px] leading-[18px] text-ink">{entry.sql}</code>
                  <span className="mt-1 flex gap-3 text-[11px] text-faint">
                    {entry.error ? (
                      <span className="text-danger">failed</span>
                    ) : (
                      <span>{entry.rowCount?.toLocaleString()} rows</span>
                    )}
                    <span>{entry.ms} ms</span>
                    <span className="ml-auto">{relativeTime(entry.at)}</span>
                  </span>
                </button>
                <button
                  onClick={() => {
                    const ws = useWorkspaceStore.getState();
                    ws.setViewMode("sql");
                    if (ws.addTab(entry.sql)) void ws.runQuery();
                  }}
                  className="absolute right-1.5 top-1.5 rounded p-1 text-muted opacity-0 hover:bg-sunken hover:text-ink focus:opacity-100 group-hover/h:opacity-100"
                  title="Run again in a new tab"
                  aria-label="Run again"
                >
                  <Icon name="play" size={13} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
