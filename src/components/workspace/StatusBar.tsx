"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useShallow } from "zustand/react/shallow";
import { RESULTS_ERROR_ID } from "@/components/results/ResultsPanel";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { modelLabel, useAiStore } from "@/stores/ai-store";
import { isServerBacked } from "@/lib/persistence";
import { Icon } from "@/components/ui/icons";

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** A 24px status strip: engine, space and sync state on the left, last result and AI model on the right. */
export default function StatusBar() {
  const dbReady = useWorkspaceStore((s) => s.dbReady);
  const spaceName = useWorkspaceStore((s) => s.spaces.find((sp) => sp.id === s.spaceId)?.name ?? null);
  // Primitives only: the tab record changes on every keystroke, and the bar must not re-render for that.
  const run = useWorkspaceStore(
    useShallow((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      return {
        isExecuting: tab?.isExecuting ?? false,
        errorLine: tab?.error?.message.split("\n")[0] ?? null,
        ms: tab?.result?.executionTimeMs ?? null,
      };
    })
  );
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const aiLabel = useAiStore((s) => s.loaded ? modelLabel(s.provider, s.efforts[s.provider]) : null);
  const persistEnabled = useWorkspaceStore((s) => s.persistEnabled);
  const workspacePage = useUiStore((s) => s.workspacePage);
  const [storage, setStorage] = useState<"server" | "browser" | null>(null);

  useEffect(() => {
    let active = true;
    void isServerBacked().then((server) => { if (active) setStorage(server ? "server" : "browser"); });
    return () => { active = false; };
  }, []);
  const cursor = useUiStore((s) => s.cursor);
  const viewMode = useWorkspaceStore((s) => s.viewMode);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!dbReady) return;
    let cancelled = false;
    void import("@/lib/duckdb/instance")
      .then(({ getConnection }) => getConnection())
      .then((conn) => conn.query("SELECT version() AS v"))
      .then((table) => {
        const v = table.toArray()[0]?.v;
        if (!cancelled && v) setVersion(String(v));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dbReady]);

  const showError = () => {
    const card = document.getElementById(RESULTS_ERROR_ID);
    if (!card) return;
    card.scrollIntoView({ block: "nearest" });
    card.focus({ preventScroll: true });
  };

  return (
    <footer className="flex h-6 shrink-0 items-center gap-2 overflow-hidden sm:gap-4 border-t border-line bg-chrome px-3 text-[11px] text-muted" aria-label="Status bar">
      <span className="flex shrink-0 items-center gap-1.5" title={dbReady ? "DuckDB-Wasm is running in your browser" : "DuckDB is starting"}>
        <span className={`size-1.5 rounded-full ${dbReady ? "bg-ok" : "bg-warn"}`} aria-hidden="true" />
        DuckDB{version ? ` ${version}` : ""} {dbReady ? "ready" : "starting"}
      </span>
      {spaceName && (
        <span className="hidden min-w-0 items-center gap-1.5 sm:flex" title="Current space">
          <Icon name="folder" size={12} className="text-faint" />
          <span className="max-w-[180px] truncate">{spaceName}</span>
        </span>
      )}
      <span className="flex shrink-0 items-center gap-1.5" title="Storage location and network connectivity; this is not a save confirmation">
        <Icon name={online ? "folder" : "alert"} size={12} className={online ? "text-faint" : "text-warn"} />
        {!persistEnabled ? "Shared session" : !online ? "Offline" : storage === "server" ? "Server storage" : storage === "browser" ? "Browser storage" : "Checking storage…"}
      </span>

      <span className="ml-auto" />
      {workspacePage === "workbench" && viewMode === "sql" && cursor && (
        <span className="hidden shrink-0 tabular-nums lg:inline" title="Cursor position">
          Ln {cursor.line}, Col {cursor.column}
          {cursor.selected > 0 && ` (${cursor.selected.toLocaleString()} selected)`}
        </span>
      )}
      {run.isExecuting ? (
        <span className="shrink-0">Running…</span>
      ) : run.errorLine !== null ? (
        <button
          onClick={showError}
          title={run.errorLine}
          className="inline-flex h-5 max-w-[50%] shrink-0 items-center gap-1 truncate whitespace-nowrap rounded px-1 text-danger transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Icon name="alert" size={12} />
          1 error · click to view
        </button>
      ) : run.ms !== null ? (
        <span className="shrink-0 tabular-nums" title="Duration of the last run (rows are counted above the results)">
          Ran in {run.ms.toLocaleString()} ms
        </span>
      ) : null}
      {aiLabel && (
        <span className="hidden max-w-64 shrink-0 items-center gap-1.5 truncate xl:flex" title="AI model">
          <Icon name="sparkle" size={12} className="text-faint" />
          {aiLabel}
        </span>
      )}
    </footer>
  );
}
