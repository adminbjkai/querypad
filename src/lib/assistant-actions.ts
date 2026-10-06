import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore, toast } from "@/stores/ui-store";
import { useSnippetStore } from "@/stores/snippet-store";
import { relationshipKey } from "@/lib/discovery/relationships";
import { openSnippet, previewTable } from "@/lib/workspace-actions";
import type { AssistantAction } from "@/lib/ai/assistant-context";

/** One-line description shown on the action card. */
export function describeAction(action: AssistantAction): string {
  switch (action.type) {
    case "run_in_tab":
      return `Run in a new tab${action.title ? ` “${action.title}”` : ""}`;
    case "open_tab":
      return `Open in a new tab${action.title ? ` “${action.title}”` : ""}`;
    case "replace_query":
      return "Replace the query in the current tab";
    case "save_snippet":
      return `Save snippet “${action.name}”${action.folder ? ` in ${action.folder}` : ""}`;
    case "preview_table":
      return `Preview table ${action.table}`;
    case "profile_table":
      return `Profile table ${action.table}`;
    case "show_panel":
      return `Show the ${action.panel} panel`;
    case "discover_joins":
      return "Re-discover joins between tables";
    case "set_join":
      return `${action.verdict === "accepted" ? "Accept" : "Reject"} join ${action.from} → ${action.to}`;
    case "switch_space":
      return `Switch to space “${action.name}”`;
  }
}

/** SQL carried by the action, shown in the card. */
export function actionSql(action: AssistantAction): string | null {
  return "sql" in action ? action.sql : null;
}

const ws = () => useWorkspaceStore.getState();

/** Carry out an action the user approved. Returns false (and tells the user) if it can't. */
export async function applyAction(action: AssistantAction): Promise<boolean> {
  switch (action.type) {
    case "run_in_tab":
    case "open_tab":
      openSnippet(action.sql, action.title?.trim() || "Assistant query", action.type === "run_in_tab");
      return true;
    case "replace_query": {
      ws().setViewMode("sql");
      ws().updateTab(ws().activeTabId, { query: action.sql });
      return true;
    }
    case "save_snippet":
      await useSnippetStore.getState().save({ name: action.name, sql: action.sql, folder: action.folder });
      toast(`Saved snippet “${action.name}”.`, "success");
      return true;
    case "preview_table":
    case "profile_table": {
      const known = [...ws().tables, ...ws().views].some((t) => t.name === action.table);
      if (!known) {
        toast(`There's no table called ${action.table}.`, "warning");
        return false;
      }
      if (action.type === "preview_table") previewTable(action.table);
      else {
        useUiStore.getState().showPanel("tables");
        useUiStore.getState().setProfileTable(action.table);
      }
      return true;
    }
    case "show_panel":
      useUiStore.getState().showPanel(action.panel);
      return true;
    case "discover_joins":
      useUiStore.getState().showPanel("joins");
      await ws().discoverRelationships();
      return true;
    case "set_join": {
      const rel = ws().discovery.relationships.find(
        (r) => `${r.from.table}.${r.from.column}` === action.from && `${r.to.table}.${r.to.column}` === action.to
      );
      if (!rel) {
        toast(`No inferred join ${action.from} → ${action.to}.`, "warning");
        return false;
      }
      ws().setRelationshipVerdict(relationshipKey(rel), action.verdict);
      return true;
    }
    case "switch_space": {
      const space = ws().spaces.find((s) => s.name.toLowerCase() === action.name.trim().toLowerCase());
      if (!space) {
        toast(`No space called “${action.name}”.`, "warning");
        return false;
      }
      await ws().switchSpace(space.id);
      return true;
    }
  }
}
