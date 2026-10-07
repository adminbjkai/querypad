"use client";

import { useMemo, useState } from "react";
import { useWorkspaceStore, type HistoryEntry } from "@/stores/workspace-store";
import { Icon } from "@/components/ui/icons";
import PanelHeader, { SearchBox } from "./PanelHeader";
import { HoverTray, Segmented, btn } from "@/components/ui/primitives";
import { relativeTime } from "@/components/home/format";

type Filter = "all" | "ok" | "failed";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ok", label: "Succeeded" },
  { value: "failed", label: "Failed" },
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

  const rerun = (entry: HistoryEntry) => {
    const ws = useWorkspaceStore.getState();
    ws.setViewMode("sql");
    if (ws.addTab(entry.sql)) void ws.runQuery();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="History" count={history.length > 0 ? `${history.length} ${history.length === 1 ? "query" : "queries"}` : undefined}>
        <button onClick={clearHistory} disabled={history.length === 0} className={btn.ghost}>
          Clear
        </button>
      </PanelHeader>

      {history.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-10 text-center">
          <span className="flex size-9 items-center justify-center rounded-lg bg-raised text-muted">
            <Icon name="history" size={18} />
          </span>
          <p className="mt-3 text-[14px] font-medium text-ink">No queries yet</p>
          <p className="mt-1 text-[13px] leading-5 text-muted">
            Queries you run show up here, newest first, so you can reopen or rerun them.
          </p>
        </div>
      ) : (
        <>
          <SearchBox value={query} onChange={setQuery} placeholder="Search history" label="Search history" />
          <div className="px-3 pb-2.5">
            <Segmented value={filter} onChange={setFilter} options={FILTERS} ariaLabel="Filter history" size="sm" />
          </div>
          {visible.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-muted">No queries match.</p>}
          <ul className="min-h-0 flex-1 overflow-y-auto divide-y divide-line border-t border-line pb-3 text-[13px]">
            {visible.map((entry) => (
              <li key={entry.id} className="group relative">
                <button onClick={() => open(entry)} className="w-full px-3 py-2 text-left transition-colors hover:bg-sunken" title="Open in editor">
                  <span className="flex items-start gap-2">
                    <span
                      className={`mt-[7px] size-1.5 shrink-0 rounded-full ${entry.error ? "bg-danger" : "bg-ok"}`}
                      title={entry.error ? "Failed" : "Succeeded"}
                    />
                    <code className="line-clamp-2 break-all font-mono text-[12px] leading-4 text-ink">{entry.sql}</code>
                  </span>
                  <span className="mt-1 flex gap-3 pl-3.5 text-[11px] tabular-nums text-faint">
                    {entry.error ? (
                      <span className="text-danger">failed</span>
                    ) : (
                      <span>{entry.rowCount?.toLocaleString()} rows</span>
                    )}
                    <span>{entry.ms} ms</span>
                    <span className="ml-auto">{relativeTime(entry.at)}</span>
                  </span>
                </button>
                <HoverTray className="top-1.5! translate-y-0!">
                  <button onClick={() => rerun(entry)} className={btn.iconSm} title="Run again in a new tab" aria-label="Run again">
                    <Icon name="play" size={14} />
                  </button>
                </HoverTray>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
