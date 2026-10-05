import { create } from "zustand";
import type { TableInfo, EditorTab, TableProfileState, TableProfile } from "@/types";
import type {
  Relationship,
  RelationshipDiscoveryState,
  RelationshipVerdict,
} from "@/types/discovery";
import type { Pipeline, PipelineStep, PipelineExecutionResult } from "@/types/pipeline";
import type { LoadedPlugin } from "@/types/plugin";
import {
  saveState,
  saveFile,
  deleteFiles,
  loadWorkspace,
  clearPersistedWorkspace,
  type FileEntry,
} from "@/lib/persistence/indexeddb";
import { getConnection } from "@/lib/duckdb/instance";
import { quoteIdent } from "@/lib/duckdb/sql-utils";
import { relationshipKey } from "@/lib/discovery/relationships";
import {
  ACCEPTED_EXTENSIONS,
  SAMPLE_FILES,
  SAMPLE_QUERY,
  SAMPLE_TABLE_NAMES,
  checkFileSize,
} from "@/lib/constants";
import { fileExtension } from "@/lib/utils";
import { toast } from "@/stores/ui-store";

export interface HistoryEntry {
  id: string;
  sql: string;
  at: number;
  rowCount: number | null;
  ms: number;
  error: string | null;
}

export interface ImportSummary {
  added: string[];
  problems: { tone: "warning" | "error"; message: string }[];
}

const IDLE_DISCOVERY: RelationshipDiscoveryState = {
  status: "idle",
  relationships: [],
  error: null,
};

const MAX_TABS = 20;
const MAX_HISTORY = 100;
const HISTORY_KEY = "querypad:history";

/** Profiles being built right now, so concurrent callers share one run. */
const profilesInFlight = new Map<string, Promise<TableProfile | null>>();

/** Merge user overrides onto a base relationship list (override wins, by key). */
function mergeOverrides(base: Relationship[], overrides: Relationship[]): Relationship[] {
  const byKey = new Map<string, Relationship>();
  for (const rel of base) byKey.set(relationshipKey(rel), rel);
  for (const rel of overrides) byKey.set(relationshipKey(rel), rel);
  return [...byKey.values()];
}

function createTab(index: number, query = ""): EditorTab {
  return {
    id: crypto.randomUUID(),
    title: `Query ${index}`,
    query,
    result: null,
    error: null,
    isExecuting: false,
    createdAt: Date.now(),
  };
}

function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

const initialTab = createTab(1);

interface WorkspaceState {
  dbReady: boolean;
  setDbReady: (ready: boolean) => void;

  _hydrated: boolean;
  restoreFromIndexedDB: () => Promise<void>;
  /** False on /shared links so viewing someone's data never overwrites your workspace. */
  persistEnabled: boolean;
  /** Make the current (shared) workspace yours: persist everything and keep saving. */
  adoptAsWorkspace: () => Promise<void>;

  // Tables
  tables: TableInfo[];
  fileEntries: FileEntry[];
  /** Saved files that failed to load this session; kept in the saved index so they aren't lost. */
  unrestoredFiles: { name: string; fileName: string }[];
  tableProfiles: Record<string, TableProfileState>;
  addTable: (table: TableInfo, fileName: string, data: Uint8Array) => void;
  removeTable: (name: string) => Promise<void>;
  importFiles: (files: Iterable<File>) => Promise<ImportSummary>;
  loadSampleData: () => Promise<void>;
  loadTableProfile: (name: string) => Promise<TableProfile | null>;

  // Relationship discovery + verification
  discovery: RelationshipDiscoveryState;
  relationshipVerdicts: Record<string, RelationshipVerdict>;
  relationshipOverrides: Relationship[];
  discoverRelationships: () => Promise<void>;
  setRelationshipVerdict: (key: string, verdict: RelationshipVerdict | null) => void;
  editRelationship: (oldKey: string, next: Relationship) => void;

  clearWorkspace: () => Promise<void>;

  // Tabs + queries
  tabs: EditorTab[];
  activeTabId: string;
  /** Returns false (and tells the user) when the tab limit is reached. */
  addTab: (query?: string) => boolean;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, patch: Partial<EditorTab>) => void;
  renameTab: (id: string, title: string) => void;
  /** Run `sql` (or the tab's full query) in a tab and record it in history. */
  runQuery: (tabId?: string, sql?: string) => Promise<void>;

  history: HistoryEntry[];
  clearHistory: () => void;

  // Pipelines
  pipelines: Pipeline[];
  activePipelineId: string | null;
  pipelineResults: Record<string, PipelineExecutionResult>;
  viewMode: "sql" | "pipeline";
  addPipeline: () => void;
  removePipeline: (id: string) => void;
  setActivePipeline: (id: string) => void;
  addPipelineStep: (pipelineId: string) => void;
  removePipelineStep: (pipelineId: string, stepId: string) => void;
  updatePipelineStep: (pipelineId: string, stepId: string, patch: Partial<PipelineStep>) => void;
  setPipelineResults: (results: Record<string, PipelineExecutionResult>) => void;
  setViewMode: (mode: "sql" | "pipeline") => void;

  // Plugins
  plugins: LoadedPlugin[];
  loadPlugin: (url: string) => Promise<void>;
  unloadPlugin: (id: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  dbReady: false,
  setDbReady: (ready) => set({ dbReady: ready }),

  _hydrated: false,
  restoreFromIndexedDB: async () => {
    try {
      const persisted = await loadWorkspace();
      if (!persisted) return;

      // Plugins first: a plugin may be the file loader for some saved files.
      if (persisted.pluginUrls?.length) {
        const { loadPluginFromUrl } = await import("@/lib/plugins/registry");
        for (const url of persisted.pluginUrls) {
          try {
            const plugin = await loadPluginFromUrl(url);
            set((s) => ({
              plugins: [...s.plugins.filter((p) => p.manifest.id !== plugin.manifest.id), plugin],
            }));
          } catch (err) {
            console.error(`Failed to reload plugin from ${url}:`, err);
          }
        }
      }

      const { loadBufferAsTable } = await import("@/lib/duckdb/files");
      const tables: TableInfo[] = [];
      const fileEntries: FileEntry[] = [];
      const unrestoredFiles: { name: string; fileName: string }[] = [];
      const loaded = new Set<string>();
      for (const entry of persisted.fileEntries) {
        try {
          tables.push(await loadBufferAsTable(entry.name, entry.fileName, new Uint8Array(entry.data)));
          fileEntries.push(entry);
          loaded.add(entry.name);
        } catch (err) {
          console.error(`Failed to restore ${entry.fileName}:`, err);
          unrestoredFiles.push({ name: entry.name, fileName: entry.fileName });
        }
      }
      // Index entries whose bytes are missing are kept too, rather than silently forgotten.
      for (const f of persisted.files ?? []) {
        if (!loaded.has(f.name) && !unrestoredFiles.some((u) => u.name === f.name)) unrestoredFiles.push(f);
      }
      if (unrestoredFiles.length > 0) {
        toast(
          `Couldn't reopen ${unrestoredFiles.map((f) => f.fileName).join(", ")}. The saved copy is kept — add the file again to replace it.`,
          "warning"
        );
      }

      const tabs = (persisted.tabs ?? []).map((pt) => ({
        ...createTab(1, pt.query),
        id: pt.id,
        title: pt.title,
        createdAt: pt.createdAt,
      }));

      set({
        tables,
        fileEntries,
        unrestoredFiles,
        tableProfiles: Object.fromEntries(
          tables.map((t) => [t.name, { status: "idle", profile: null, error: null }])
        ),
        ...(tabs.length > 0 && {
          tabs,
          activeTabId: tabs.some((t) => t.id === persisted.activeTabId)
            ? persisted.activeTabId!
            : tabs[0].id,
        }),
        ...(persisted.pipelines?.length && {
          pipelines: persisted.pipelines,
          activePipelineId: persisted.activePipelineId ?? persisted.pipelines[0].id,
        }),
        viewMode: persisted.viewMode ?? "sql",
        relationshipVerdicts: persisted.relationshipVerdicts ?? {},
        relationshipOverrides: persisted.relationshipOverrides ?? [],
      });
    } catch (err) {
      console.error("Failed to restore from IndexedDB:", err);
    } finally {
      set({ _hydrated: true });
    }
  },

  persistEnabled: true,
  adoptAsWorkspace: async () => {
    await clearPersistedWorkspace();
    for (const entry of get().fileEntries) await saveFile(entry);
    await saveState(snapshotState());
    set({ persistEnabled: true });
  },

  tables: [],
  fileEntries: [],
  unrestoredFiles: [],
  tableProfiles: {},
  addTable: (table, fileName, data) =>
    set((state) => ({
      tables: [...state.tables.filter((t) => t.name !== table.name), table],
      unrestoredFiles: state.unrestoredFiles.filter((f) => f.name !== table.name),
      fileEntries: [
        ...state.fileEntries.filter((f) => f.name !== table.name),
        { name: table.name, fileName, data: new Uint8Array(data) },
      ],
      tableProfiles: {
        ...state.tableProfiles,
        [table.name]: { status: "idle", profile: null, error: null },
      },
      // Tables changed — the relationship graph must be re-derived.
      discovery: IDLE_DISCOVERY,
    })),

  removeTable: async (name) => {
    set((state) => {
      const tableProfiles = { ...state.tableProfiles };
      delete tableProfiles[name];
      return {
        tables: state.tables.filter((t) => t.name !== name),
        fileEntries: state.fileEntries.filter((f) => f.name !== name),
        unrestoredFiles: state.unrestoredFiles.filter((f) => f.name !== name),
        tableProfiles,
        discovery: IDLE_DISCOVERY,
        relationshipOverrides: state.relationshipOverrides.filter(
          (rel) => rel.from.table !== name && rel.to.table !== name
        ),
      };
    });
    try {
      const conn = await getConnection();
      await conn.query(`DROP TABLE IF EXISTS ${quoteIdent(name)}`);
    } catch (err) {
      console.error("Failed to drop table:", err);
    }
  },

  importFiles: async (files) => {
    const summary: ImportSummary = { added: [], problems: [] };
    const { loadFileAsTable } = await import("@/lib/duckdb/files");
    const hadOnlySamples =
      get().tables.length > 0 && get().tables.every((t) => SAMPLE_TABLE_NAMES.has(t.name));

    for (const file of files) {
      const ext = "." + fileExtension(file.name);
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        summary.problems.push({ tone: "error", message: `${file.name}: unsupported file type.` });
        continue;
      }
      const size = checkFileSize(file);
      if (size) summary.problems.push({ tone: size.type, message: size.message });
      if (size?.type === "error") continue;
      try {
        const { table, data } = await loadFileAsTable(file);
        get().addTable(table, file.name, data);
        summary.added.push(table.name);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        summary.problems.push({ tone: "error", message: `${file.name}: ${reason}` });
      }
    }

    // First real data replaces the demo tables.
    if (hadOnlySamples && summary.added.length > 0) {
      for (const name of SAMPLE_TABLE_NAMES) {
        if (!summary.added.includes(name)) await get().removeTable(name);
      }
    }
    return summary;
  },

  loadSampleData: async () => {
    const { loadBufferAsTable } = await import("@/lib/duckdb/files");
    for (const fileName of SAMPLE_FILES) {
      const response = await fetch(`/sample/${fileName}`);
      const data = new Uint8Array(await response.arrayBuffer());
      const name = fileName.replace(/\.[^.]+$/, "");
      const table = await loadBufferAsTable(name, fileName, new Uint8Array(data));
      get().addTable(table, fileName, data);
    }
    const tab = get().tabs.find((t) => t.id === get().activeTabId);
    if (tab && !tab.query.trim()) get().updateTab(tab.id, { query: SAMPLE_QUERY });
  },

  loadTableProfile: (name) => {
    const pending = profilesInFlight.get(name);
    if (pending) return pending;
    const run = buildProfile(name).finally(() => profilesInFlight.delete(name));
    profilesInFlight.set(name, run);
    return run;
  },

  discovery: IDLE_DISCOVERY,
  relationshipVerdicts: {},
  relationshipOverrides: [],

  discoverRelationships: async () => {
    // A run in progress always belongs to the current tables (adding/removing resets to idle).
    if (get().discovery.status === "loading") return;
    const tables = get().tables;
    const names = new Set(tables.map((t) => t.name));
    const validOverrides = () =>
      get().relationshipOverrides.filter(
        (rel) => names.has(rel.from.table) && names.has(rel.to.table)
      );

    if (tables.length < 2) {
      set({ discovery: { status: "ready", relationships: validOverrides(), error: null } });
      return;
    }

    set((state) => ({ discovery: { ...state.discovery, status: "loading", error: null } }));
    // Tables changing mid-run reset discovery to idle; a stale run must not overwrite that.
    const stale = () => get().tables !== tables;
    try {
      // Reuse profiles the user already built; profile the rest (and cache them).
      const profiles: TableProfile[] = [];
      for (const table of tables) {
        const cached = get().tableProfiles[table.name];
        const profile =
          cached?.status === "ready" && cached.profile
            ? cached.profile
            : await get().loadTableProfile(table.name);
        if (stale()) return;
        if (!profile) throw new Error(`Could not profile ${table.name}`);
        profiles.push(profile);
      }
      const [{ discoverRelationships }, { createBrowserQueryRunner }] = await Promise.all([
        import("@/lib/discovery/relationships"),
        import("@/lib/duckdb/browser-runner"),
      ]);
      const base = await discoverRelationships(profiles, createBrowserQueryRunner());
      if (stale()) return;
      set({
        discovery: {
          status: "ready",
          relationships: mergeOverrides(base, validOverrides()),
          error: null,
        },
      });
    } catch (err) {
      if (stale()) return;
      set({
        discovery: {
          status: "error",
          relationships: [],
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  },

  setRelationshipVerdict: (key, verdict) =>
    set((state) => {
      const next = { ...state.relationshipVerdicts };
      if (verdict === null) delete next[key];
      else next[key] = verdict;
      return { relationshipVerdicts: next };
    }),

  editRelationship: (oldKey, next) =>
    set((state) => {
      const nextKey = relationshipKey(next);
      const verdicts = { ...state.relationshipVerdicts };
      delete verdicts[oldKey];
      verdicts[nextKey] = "accepted";
      const overrides = state.relationshipOverrides.filter(
        (rel) => relationshipKey(rel) !== oldKey && relationshipKey(rel) !== nextKey
      );
      overrides.push(next);
      const relationships = mergeOverrides(
        state.discovery.relationships.filter((rel) => relationshipKey(rel) !== oldKey),
        [next]
      );
      return {
        relationshipVerdicts: verdicts,
        relationshipOverrides: overrides,
        discovery: { ...state.discovery, relationships },
      };
    }),

  clearWorkspace: async () => {
    const currentTables = get().tables;
    try {
      const conn = await getConnection();
      for (const t of currentTables) {
        await conn.query(`DROP TABLE IF EXISTS ${quoteIdent(t.name)}`);
      }
    } catch (err) {
      console.error("Failed to drop tables:", err);
    }
    // On a shared link the saved workspace belongs to someone else's session — leave it alone.
    if (get().persistEnabled) await clearPersistedWorkspace();
    const tab = createTab(1);
    set({
      tables: [],
      fileEntries: [],
      unrestoredFiles: [],
      tableProfiles: {},
      discovery: IDLE_DISCOVERY,
      relationshipVerdicts: {},
      relationshipOverrides: [],
      tabs: [tab],
      activeTabId: tab.id,
      pipelines: [],
      activePipelineId: null,
      pipelineResults: {},
      viewMode: "sql",
    });
  },

  tabs: [initialTab],
  activeTabId: initialTab.id,

  addTab: (query = "") => {
    const { tabs } = get();
    if (tabs.length >= MAX_TABS) {
      toast(`You have ${MAX_TABS} tabs open. Close one to open another.`, "warning");
      return false;
    }
    const used = new Set(tabs.map((t) => t.title));
    let index = tabs.length + 1;
    while (used.has(`Query ${index}`)) index++;
    const tab = createTab(index, query);
    set({ tabs: [...tabs, tab], activeTabId: tab.id });
    return true;
  },

  removeTab: (id) =>
    set((state) => {
      if (state.tabs.length <= 1) return state;
      const idx = state.tabs.findIndex((t) => t.id === id);
      const tabs = state.tabs.filter((t) => t.id !== id);
      const activeTabId =
        state.activeTabId === id ? tabs[Math.min(idx, tabs.length - 1)].id : state.activeTabId;
      return { tabs, activeTabId };
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTab: (id, patch) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),

  renameTab: (id, title) => get().updateTab(id, { title }),

  runQuery: async (tabId, sql) => {
    const id = tabId ?? get().activeTabId;
    const tab = get().tabs.find((t) => t.id === id);
    const text = (sql ?? tab?.query ?? "").trim();
    if (!tab || !text || tab.isExecuting) return;

    get().updateTab(id, { isExecuting: true, error: null });
    const started = performance.now();
    const { executeQuery } = await import("@/lib/duckdb/queries");
    let entry: HistoryEntry;
    try {
      const result = await executeQuery(text);
      get().updateTab(id, { result, error: null, isExecuting: false, lastRunSql: text });
      entry = {
        id: crypto.randomUUID(),
        sql: text,
        at: Date.now(),
        rowCount: result.rowCount,
        ms: result.executionTimeMs,
        error: null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      get().updateTab(id, { error: { message }, result: null, isExecuting: false, lastRunSql: text });
      entry = {
        id: crypto.randomUUID(),
        sql: text,
        at: Date.now(),
        rowCount: null,
        ms: Math.round(performance.now() - started),
        error: message,
      };
    }
    set((state) => {
      // Re-running the same SQL moves it to the top instead of duplicating it.
      const history = [entry, ...state.history.filter((h) => h.sql !== text)].slice(0, MAX_HISTORY);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      return { history };
    });
  },

  history: loadHistory(),
  clearHistory: () => {
    localStorage.removeItem(HISTORY_KEY);
    set({ history: [] });
  },

  // Pipelines
  pipelines: [],
  activePipelineId: null,
  pipelineResults: {},
  viewMode: "sql",

  addPipeline: () =>
    set((state) => {
      const pipeline: Pipeline = {
        id: crypto.randomUUID(),
        title: `Pipeline ${state.pipelines.length + 1}`,
        steps: [],
        createdAt: Date.now(),
      };
      return {
        pipelines: [...state.pipelines, pipeline],
        activePipelineId: pipeline.id,
        pipelineResults: {},
      };
    }),

  removePipeline: (id) =>
    set((state) => {
      const pipelines = state.pipelines.filter((p) => p.id !== id);
      const wasActive = state.activePipelineId === id;
      return {
        pipelines,
        activePipelineId: wasActive ? pipelines[0]?.id ?? null : state.activePipelineId,
        pipelineResults: wasActive ? {} : state.pipelineResults,
      };
    }),

  setActivePipeline: (id) => set({ activePipelineId: id, pipelineResults: {} }),

  addPipelineStep: (pipelineId) =>
    set((state) => ({
      pipelines: state.pipelines.map((p) => {
        if (p.id !== pipelineId) return p;
        const step: PipelineStep = {
          id: crypto.randomUUID(),
          name: `step_${p.steps.length + 1}`,
          query: "",
        };
        return { ...p, steps: [...p.steps, step] };
      }),
    })),

  removePipelineStep: (pipelineId, stepId) =>
    set((state) => ({
      pipelines: state.pipelines.map((p) =>
        p.id === pipelineId ? { ...p, steps: p.steps.filter((s) => s.id !== stepId) } : p
      ),
    })),

  updatePipelineStep: (pipelineId, stepId, patch) =>
    set((state) => ({
      pipelines: state.pipelines.map((p) =>
        p.id === pipelineId
          ? { ...p, steps: p.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)) }
          : p
      ),
    })),

  setPipelineResults: (pipelineResults) => set({ pipelineResults }),

  setViewMode: (viewMode) =>
    set((state) => {
      if (viewMode === "pipeline" && state.pipelines.length === 0) {
        const pipeline: Pipeline = {
          id: crypto.randomUUID(),
          title: "Pipeline 1",
          steps: [],
          createdAt: Date.now(),
        };
        return { viewMode, pipelines: [pipeline], activePipelineId: pipeline.id };
      }
      return { viewMode };
    }),

  // Plugins
  plugins: [],

  loadPlugin: async (url) => {
    const { loadPluginFromUrl } = await import("@/lib/plugins/registry");
    const plugin = await loadPluginFromUrl(url);
    set((state) => ({
      plugins: [...state.plugins.filter((p) => p.manifest.id !== plugin.manifest.id), plugin],
    }));
  },

  unloadPlugin: (id) =>
    set((state) => ({ plugins: state.plugins.filter((p) => p.manifest.id !== id) })),
}));

/** Profile one table and record the outcome in the store. */
async function buildProfile(name: string): Promise<TableProfile | null> {
  const store = useWorkspaceStore;
  const table = store.getState().tables.find((t) => t.name === name);
  if (!table) return null;
  const current = store.getState().tableProfiles[name];
  const setProfile = (next: TableProfileState) =>
    store.setState((state) => ({ tableProfiles: { ...state.tableProfiles, [name]: next } }));

  setProfile({ status: "loading", profile: current?.profile ?? null, error: null });
  try {
    const { profileTable } = await import("@/lib/duckdb/profile");
    const profile = await profileTable(table);
    if (!store.getState().tables.some((t) => t.name === name)) return null;
    setProfile({ status: "ready", profile, error: null });
    return profile;
  } catch (err) {
    if (store.getState().tables.some((t) => t.name === name)) {
      setProfile({
        status: "error",
        profile: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return null;
  }
}

// --- Persistence -----------------------------------------------------------------
// State (tabs, pipelines, verdicts…) is debounced; file bytes are written once when a
// file appears and deleted when it goes away.

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function snapshotState() {
  const s = useWorkspaceStore.getState();
  return {
    files: [...s.fileEntries.map(({ name, fileName }) => ({ name, fileName })), ...s.unrestoredFiles],
    tabs: s.tabs.map(({ id, title, query, createdAt }) => ({ id, title, query, createdAt })),
    activeTabId: s.activeTabId,
    pipelines: s.pipelines,
    activePipelineId: s.activePipelineId,
    viewMode: s.viewMode,
    pluginUrls: s.plugins.filter((p) => p.url).map((p) => p.url),
    relationshipVerdicts: s.relationshipVerdicts,
    relationshipOverrides: s.relationshipOverrides,
  };
}

useWorkspaceStore.subscribe((state, prev) => {
  if (!state._hydrated || !state.persistEnabled || !prev.persistEnabled) return;

  if (state.fileEntries !== prev.fileEntries && prev._hydrated) {
    const prevByName = new Map(prev.fileEntries.map((f) => [f.name, f]));
    const nextNames = new Set(state.fileEntries.map((f) => f.name));
    for (const entry of state.fileEntries) {
      if (prevByName.get(entry.name) !== entry) saveFile(entry).catch(console.error);
    }
    deleteFiles([...prevByName.keys()].filter((n) => !nextNames.has(n))).catch(console.error);
  }

  if (
    state.fileEntries !== prev.fileEntries ||
    state.unrestoredFiles !== prev.unrestoredFiles ||
    state.tabs !== prev.tabs ||
    state.activeTabId !== prev.activeTabId ||
    state.pipelines !== prev.pipelines ||
    state.activePipelineId !== prev.activePipelineId ||
    state.viewMode !== prev.viewMode ||
    state.plugins !== prev.plugins ||
    state.relationshipVerdicts !== prev.relationshipVerdicts ||
    state.relationshipOverrides !== prev.relationshipOverrides
  ) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveState(snapshotState()).catch(console.error), 400);
  }
});
