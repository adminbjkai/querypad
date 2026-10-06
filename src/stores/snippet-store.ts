import { create } from "zustand";
import type { Snippet } from "@/types/snippet";
import { hasPendingWrites, loadSnippets, saveSnippetChanges } from "@/lib/persistence";
import { toast } from "@/stores/ui-store";

/** What the snippet dialog edits: a new snippet (no id) or an existing one. */
export type SnippetDraft = Pick<Snippet, "name" | "sql"> & Partial<Pick<Snippet, "id" | "folder" | "description">>;

interface SnippetState {
  snippets: Snippet[];
  loaded: boolean;
  /** Load the library once; later calls are no-ops. */
  init: () => Promise<void>;
  /** Re-read the library after another device changed it. */
  refresh: () => Promise<void>;
  /** Create (no id) or update a snippet; returns the saved snippet. */
  save: (draft: SnippetDraft) => Promise<Snippet>;
  remove: (id: string) => Promise<void>;
  /** Add snippets from an exported JSON file; returns how many were imported. */
  importJson: (text: string) => Promise<number>;
  exportJson: () => string;

  /** The snippet dialog: open with a draft to create or edit. */
  draft: SnippetDraft | null;
  openEditor: (draft: SnippetDraft) => void;
  closeEditor: () => void;
}

const clean = (value: string | undefined) => value?.trim() || undefined;

function byFolderThenName(a: Snippet, b: Snippet): number {
  return (a.folder ?? "").localeCompare(b.folder ?? "") || a.name.localeCompare(b.name);
}

/** Limits shared with the server route. */
export const MAX_SNIPPET_SQL = 200_000;

let writes = 0;
/** Bumped by every local change, so a refresh fetched before it never overwrites it. */
let mutations = 0;

/** Apply a local change optimistically; put the previous list back if the server refuses. */
async function commit(next: Snippet[], upsert: Snippet[], remove: string[]): Promise<void> {
  const previous = useSnippetStore.getState().snippets;
  mutations += 1;
  useSnippetStore.setState({ snippets: next });
  writes += 1;
  try {
    await saveSnippetChanges(upsert, remove, next);
  } catch (err) {
    useSnippetStore.setState({ snippets: previous });
    throw err;
  } finally {
    writes -= 1;
  }
}

export const useSnippetStore = create<SnippetState>((set, get) => ({
  snippets: [],
  loaded: false,

  init: async () => {
    if (get().loaded) return;
    try {
      set({ snippets: (await loadSnippets()).sort(byFolderThenName), loaded: true });
    } catch (err) {
      console.error("Failed to load snippets:", err);
    }
  },

  refresh: async () => {
    // Never replace the list while our own edit is still on its way.
    if (!get().loaded || writes > 0 || hasPendingWrites()) return;
    const startedAt = mutations;
    try {
      const snippets = await loadSnippets();
      if (writes === 0 && mutations === startedAt) set({ snippets: snippets.sort(byFolderThenName) });
    } catch (err) {
      console.error("Failed to refresh snippets:", err);
    }
  },

  save: async (draft) => {
    const now = Date.now();
    const existing = draft.id ? get().snippets.find((s) => s.id === draft.id) : undefined;
    const snippet: Snippet = {
      id: existing?.id ?? crypto.randomUUID().slice(0, 12),
      name: draft.name.trim() || "Untitled snippet",
      sql: draft.sql,
      folder: clean(draft.folder),
      description: clean(draft.description),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (snippet.sql.length > MAX_SNIPPET_SQL) throw new Error("the SQL is too long for a snippet (200,000 characters max).");
    await commit([...get().snippets.filter((s) => s.id !== snippet.id), snippet].sort(byFolderThenName), [snippet], []);
    return snippet;
  },

  remove: async (id) => {
    await commit(get().snippets.filter((s) => s.id !== id), [], [id]);
  },

  importJson: async (text) => {
    const parsed: unknown = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : (parsed as { snippets?: unknown })?.snippets;
    if (!Array.isArray(list)) throw new Error("Expected a QueryPad snippets file.");
    const now = Date.now();
    const incoming: Snippet[] = list
      .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
      .filter((s) => typeof s.name === "string" && typeof s.sql === "string" && s.sql.length <= MAX_SNIPPET_SQL)
      .map((s) => ({
        // Fresh ids: importing twice makes copies instead of silently overwriting edits.
        id: crypto.randomUUID().slice(0, 12),
        name: (s.name as string).slice(0, 200),
        sql: s.sql as string,
        folder: typeof s.folder === "string" ? clean(s.folder.slice(0, 100)) : undefined,
        description: typeof s.description === "string" ? clean(s.description.slice(0, 2000)) : undefined,
        createdAt: now,
        updatedAt: now,
      }));
    if (incoming.length === 0) return 0;
    await commit([...get().snippets, ...incoming].sort(byFolderThenName), incoming, []);
    return incoming.length;
  },

  exportJson: () =>
    JSON.stringify(
      {
        format: "querypad-snippets",
        version: 1,
        snippets: get().snippets.map(({ name, sql, folder, description }) => ({ name, sql, folder, description })),
      },
      null,
      2
    ),

  draft: null,
  openEditor: (draft) => set({ draft }),
  closeEditor: () => set({ draft: null }),
}));

/** Open the save dialog with the editor selection, or the whole active query. */
export async function saveCurrentAsSnippet(): Promise<void> {
  const { getSelectedText } = await import("@/lib/editor-bridge");
  const { useWorkspaceStore } = await import("@/stores/workspace-store");
  const ws = useWorkspaceStore.getState();
  const tab = ws.tabs.find((t) => t.id === ws.activeTabId);
  const sql = (getSelectedText() ?? tab?.query ?? "").trim();
  if (!sql) {
    toast("Write or select some SQL first, then save it as a snippet.", "warning");
    return;
  }
  const firstLine = sql.split("\n").find((l) => l.trim() && !l.trim().startsWith("--"))?.trim() ?? "";
  // A renamed tab is a good name; the default "Query N" isn't, so use the first SQL line.
  const named = tab?.title && !/^Query \d+$/.test(tab.title) ? tab.title : null;
  useSnippetStore.getState().openEditor({ name: named ?? firstLine.slice(0, 60), sql });
}
