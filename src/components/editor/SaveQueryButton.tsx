"use client";

import { useWorkspaceStore } from "@/stores/workspace-store";
import { saveActiveQuery } from "@/lib/workspace-actions";
import SaveQueryDialog from "@/components/library/SaveQueryDialog";
import { Icon } from "@/components/ui/icons";
import { MOD, btn } from "@/components/ui/primitives";

/** True when a saved tab's SQL differs from its library copy. */
export function useTabDirty(tabId: string | undefined): boolean {
  return useWorkspaceStore((s) => {
    const tab = s.tabs.find((t) => t.id === tabId);
    const saved = tab?.savedQueryId ? s.savedQueries.find((q) => q.id === tab.savedQueryId) : undefined;
    return !!saved && saved.sql !== tab!.query;
  });
}

/** The tab bar's "Save query" control (⌘S) plus the first-save dialog it opens. */
export default function SaveQueryButton() {
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const hasQuery = useWorkspaceStore((s) => !!s.tabs.find((t) => t.id === s.activeTabId)?.query.trim());
  const saved = useWorkspaceStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return !!tab?.savedQueryId && s.savedQueries.some((q) => q.id === tab.savedQueryId);
  });
  const dirty = useTabDirty(activeTabId);
  return (
    <>
      <button
        onClick={() => void saveActiveQuery()}
        disabled={!hasQuery && !saved}
        className={`${btn.icon} ${saved && !dirty ? "text-accent" : ""}`}
        title={saved ? (dirty ? `Save changes (${MOD}+S)` : `Saved (${MOD}+S)`) : `Save query to a folder (${MOD}+S)`}
        aria-label="Save query"
      >
        <Icon name="save" size={16} />
      </button>
      <SaveQueryDialog />
    </>
  );
}
