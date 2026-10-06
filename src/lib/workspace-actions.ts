import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast } from "@/stores/ui-store";
import { buildShareUrl } from "@/lib/sharing/encode";
import { buildAgentContext } from "@/lib/agent/context";
import { quoteIdent } from "@/lib/duckdb/sql-utils";
import { getSelectedText, insertAtCursor } from "@/lib/editor-bridge";
import { copyText } from "@/lib/export/clipboard";
import { formatBytes } from "@/lib/utils";

/** URLs beyond this length are unreliable in some browsers and proxies. */
const URL_SOFT_LIMIT = 64 * 1024;

const ws = () => useWorkspaceStore.getState();
const activeTab = () => ws().tabs.find((t) => t.id === ws().activeTabId);

/** Run the editor selection if there is one, otherwise the whole active tab. */
export function runActive(): void {
  const selection = getSelectedText()?.trim();
  void ws().runQuery(undefined, selection || undefined);
}

/** Open a new tab previewing a table and run it. */
export function previewTable(name: string): void {
  ws().setViewMode("sql");
  if (ws().addTab(`SELECT *\nFROM ${quoteIdent(name)}\nLIMIT 100`)) void ws().runQuery();
}

/** Insert snippet SQL at the editor cursor (or open it in a new tab if there's no editor). */
export function insertSnippet(sql: string): void {
  if (ws().viewMode !== "sql") ws().setViewMode("sql");
  if (!insertAtCursor(sql)) ws().addTab(sql);
}

/** Open snippet SQL in a new tab, optionally running it straight away. */
export function openSnippet(sql: string, title: string, run = false): void {
  ws().setViewMode("sql");
  if (!ws().addTab(sql)) return;
  ws().renameTab(ws().activeTabId, title);
  if (run) void ws().runQuery();
}

export async function shareWorkspace(): Promise<void> {
  const { fileEntries } = ws();
  const query = activeTab()?.query ?? "";
  if (!query.trim() && fileEntries.length === 0) {
    toast("Nothing to share yet — load a file or write a query first.", "warning");
    return;
  }
  const { url, totalSize } = buildShareUrl(query, fileEntries);
  try {
    await copyText(url);
  } catch {
    window.prompt("Copy this link:", url);
    return;
  }
  if (url.length > URL_SOFT_LIMIT) {
    toast(
      `Link copied, but it embeds ${formatBytes(totalSize)} of data (${formatBytes(url.length)} URL). Some browsers may refuse it — share smaller files for reliability.`,
      "warning"
    );
  } else {
    toast("Share link copied. It contains your data and query — no server involved.", "success");
  }
}

export async function copyAgentContext(): Promise<void> {
  const { tables, tableProfiles } = ws();
  const tab = activeTab();
  await copyText(
    buildAgentContext({
      tables,
      tableProfiles,
      activeQuery: tab?.query ?? "",
      activeResult: tab?.result ?? null,
      activeError: tab?.error ?? null,
    })
  );
  toast("Context copied — paste it into Claude Code, Codex, or any agent.", "success");
}
