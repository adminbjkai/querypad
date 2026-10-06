import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast } from "@/stores/ui-store";
import { getSelectedText, insertAtCursor } from "@/lib/editor-bridge";

/** Format the editor selection if there is one, otherwise the whole active tab's query. */
export async function formatSql(): Promise<void> {
  const { format } = await import("sql-formatter");
  const selection = getSelectedText();
  const ws = useWorkspaceStore.getState();
  const tab = ws.tabs.find((t) => t.id === ws.activeTabId);
  const source = selection ?? tab?.query ?? "";
  if (!source.trim()) return;
  try {
    const formatted = format(source, { language: "duckdb", keywordCase: "upper", tabWidth: 2 });
    if (selection !== null && insertAtCursor(formatted)) return;
    if (tab) ws.updateTab(tab.id, { query: formatted });
  } catch (err) {
    const detail = err instanceof Error ? err.message.split("\n")[0] : String(err);
    toast(`Couldn't format the SQL: ${detail}`, "error");
  }
}
