"use client";

import { useSyncExternalStore } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { Icon } from "@/components/ui/icons";

const AI_LABEL_KEY = "querypad:ai-model-label";

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** The AI model label is written by the assistant; poll gently since same-tab writes fire no event. */
function subscribeAiLabel(callback: () => void) {
  window.addEventListener("storage", callback);
  const timer = window.setInterval(callback, 2000);
  return () => {
    window.removeEventListener("storage", callback);
    window.clearInterval(timer);
  };
}

const readAiLabel = () => localStorage.getItem(AI_LABEL_KEY);

/** A 24px status strip: engine, space and sync state on the left, last result and AI model on the right. */
export default function StatusBar() {
  const dbReady = useWorkspaceStore((s) => s.dbReady);
  const spaceName = useWorkspaceStore((s) => s.spaces.find((sp) => sp.id === s.spaceId)?.name ?? null);
  const tab = useWorkspaceStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const aiLabel = useSyncExternalStore(subscribeAiLabel, readAiLabel, () => null);

  let result: { text: string; tone: string } | null = null;
  if (tab?.isExecuting) result = { text: "Running…", tone: "text-muted" };
  else if (tab?.error) result = { text: `Error: ${tab.error.message.split("\n")[0]}`, tone: "text-danger" };
  else if (tab?.result) {
    result = {
      text: `${tab.result.rowCount.toLocaleString()} ${tab.result.rowCount === 1 ? "row" : "rows"} · ${tab.result.executionTimeMs} ms`,
      tone: "text-muted",
    };
  }

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-line bg-surface px-3 text-[11px] text-muted" aria-label="Status bar">
      <span className="flex items-center gap-1.5" title={dbReady ? "DuckDB-Wasm is running in your browser" : "DuckDB is starting"}>
        <span className={`size-1.5 rounded-full ${dbReady ? "bg-ok" : "bg-warn"}`} aria-hidden="true" />
        DuckDB {dbReady ? "ready" : "starting"}
      </span>
      {spaceName && (
        <span className="flex min-w-0 items-center gap-1.5" title="Current space">
          <Icon name="folder" size={12} className="text-faint" />
          <span className="max-w-[180px] truncate">{spaceName}</span>
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <Icon name={online ? "check" : "alert"} size={12} className={online ? "text-faint" : "text-warn"} />
        {online ? "Synced to server" : "Offline"}
      </span>

      <span className="ml-auto" />
      {result && (
        <span className={`min-w-0 max-w-[50%] truncate tabular-nums ${result.tone}`} title={tab?.error?.message}>
          {result.text}
        </span>
      )}
      {aiLabel && (
        <span className="flex shrink-0 items-center gap-1.5" title="AI model">
          <Icon name="sparkle" size={12} className="text-faint" />
          {aiLabel}
        </span>
      )}
    </footer>
  );
}
