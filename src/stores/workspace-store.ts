import { create } from "zustand";
import type { TableInfo, EditorTab, TableProfileState, TableProfile, ViewInfo, AiTurn } from "@/types";
import type {
  Relationship,
  RelationshipDiscoveryState,
  RelationshipVerdict,
} from "@/types/discovery";
import type { Pipeline, PipelineStep, PipelineExecutionResult } from "@/types/pipeline";
import type { LoadedPlugin } from "@/types/plugin";
import {
  loadSpaceIndex,
  saveSpaceIndex,
  loadSpace,
  saveSpaceState,
  saveSpaceFile,
  deleteSpaceFiles,
  deleteSpaceData,
  newSpaceId,
  checkRemote,
  pullSpaceState,
  hasPendingWrites,
  type FileEntry,
  type PersistedState,
  type SpaceMeta,
} from "@/lib/persistence";
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

export type SpaceTemplate = "sample" | "empty" | "current";

const IDLE_DISCOVERY: RelationshipDiscoveryState = {
  status: "idle",
  relationships: [],
  error: null,
};

const MAX_TABS = 20;
const MAX_HISTORY = 100;
export const PLAYGROUND_NAME = "Playground";

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

function columnSignature(table: TableInfo): string {
  return table.columns.map((c) => `${c.name}:${c.type}`).join("|");
}

/** Everything that belongs to one space (reset when switching or clearing). */
function emptySpaceData() {
  const tab = createTab(1);
  return {
    tables: [] as TableInfo[],
    views: [] as ViewInfo[],
    fileEntries: [] as FileEntry[],
    unrestoredFiles: [] as { name: string; fileName: string }[],
    /** Saved views DuckDB can't currently build (their table is missing); kept, not dropped. */
    unrestoredViews: [] as { name: string; sql: string }[],
    tableProfiles: {} as Record<string, TableProfileState>,
    discovery: IDLE_DISCOVERY,
    relationshipVerdicts: {} as Record<string, RelationshipVerdict>,
    relationshipOverrides: [] as Relationship[],
    tabs: [tab],
    activeTabId: tab.id,
    history: [] as HistoryEntry[],
    pipelines: [] as Pipeline[],
    activePipelineId: null as string | null,
    pipelineResults: {} as Record<string, PipelineExecutionResult>,
    viewMode: "sql" as "sql" | "pipeline",
    plugins: [] as LoadedPlugin[],
  };
}

const initialSpace = emptySpaceData();

interface WorkspaceState {
  dbReady: boolean;
  setDbReady: (ready: boolean) => void;

  /** True once the active space is loaded; false while opening or switching spaces. */
  _hydrated: boolean;
  /** Load the space index (migrating older saves) and open the active space. */
  init: () => Promise<void>;
  /** False on /shared links so viewing someone's data never writes to your spaces. */
  persistEnabled: boolean;

  // Spaces: independent saved workspaces in this browser
  spaceId: string | null;
  spaces: SpaceMeta[];
  switchSpace: (id: string) => Promise<void>;
  /** Create a space from the sample template, empty, or as a copy of the current one. */
  createSpace: (name: string, template: SpaceTemplate) => Promise<void>;
  renameSpace: (id: string, name: string) => Promise<void>;
  deleteSpace: (id: string) => Promise<void>;

  // Tables and views
  tables: TableInfo[];
  views: ViewInfo[];
  fileEntries: FileEntry[];
  /** Saved files that failed to load this session; kept in the saved index so they aren't lost. */
  unrestoredFiles: { name: string; fileName: string }[];
  unrestoredViews: { name: string; sql: string }[];
  tableProfiles: Record<string, TableProfileState>;
  addTable: (table: TableInfo, fileName: string, data: Uint8Array) => void;
  removeTable: (name: string) => Promise<void>;
  dropView: (name: string) => Promise<void>;
  importFiles: (files: Iterable<File>) => Promise<ImportSummary>;
  loadSampleData: () => Promise<void>;
  loadTableProfile: (name: string) => Promise<TableProfile | null>;
  /**
   * Reconcile the sidebar with DuckDB's catalog after SQL changed it: new or modified
   * tables are snapshotted (so they persist), dropped ones removed, views refreshed.
   */
  syncCatalog: (touched?: Set<string>) => Promise<void>;

  // Relationship discovery + verification
  discovery: RelationshipDiscoveryState;
  relationshipVerdicts: Record<string, RelationshipVerdict>;
  relationshipOverrides: Relationship[];
  discoverRelationships: () => Promise<void>;
  setRelationshipVerdict: (key: string, verdict: RelationshipVerdict | null) => void;
  editRelationship: (oldKey: string, next: Relationship) => void;

  /** Remove every table, view, tab and run from the current space. */
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
  appendAiTurn: (tabId: string, turn: AiTurn) => void;
  clearAiThread: (tabId: string) => void;

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
  persistEnabled: true,

  init: async () => {
    // Coming from a shared link (saving off, its tables still in DuckDB): start clean.
    const fromShared = !get().persistEnabled;
    set({ _hydrated: false, persistEnabled: true });
    try {
      if (fromShared) {
        await resetEngine();
        set({ ...emptySpaceData() });
      }
      const index = await loadSpaceIndex();
      if (index.spaces.length === 0) {
        // First visit: a Playground space with the sample tables to explore right away.
        const meta = newMeta(PLAYGROUND_NAME);
        set({ spaces: [meta], spaceId: meta.id });
        await saveSpaceIndex({ activeId: meta.id, spaces: [meta] });
        await get().loadSampleData().catch((err) => console.error("Failed to load sample data:", err));
        await persistEverything(meta.id);
        return;
      }
      const active = index.spaces.find((s) => s.id === index.activeId) ?? index.spaces[0];
      set({ spaces: index.spaces, spaceId: active.id });
      await openSpace(active.id);
    } catch (err) {
      console.error("Failed to open saved spaces:", err);
    } finally {
      set({ _hydrated: true });
    }
  },

  spaceId: null,
  spaces: [],

  switchSpace: async (id) => {
    if (id === get().spaceId || !get().spaces.some((s) => s.id === id)) return;
    await flushPendingSave();
    await leaveRoom();
    set({ _hydrated: false });
    try {
      await resetEngine();
      set({ ...emptySpaceData(), spaceId: id });
      await openSpace(id);
      await saveSpaceIndex({ activeId: id, spaces: get().spaces });
    } finally {
      set({ _hydrated: true });
    }
  },

  createSpace: async (name, template) => {
    await flushPendingSave();
    const meta = newMeta(name.trim() || "Untitled space");
    if (template === "current") {
      // Same tables and tabs, saved under a new space; the engine already holds the data.
      set((s) => ({ spaces: [...s.spaces, meta], spaceId: meta.id, persistEnabled: true }));
      await persistEverything(meta.id);
      return;
    }
    await leaveRoom();
    set({ _hydrated: false });
    try {
      await resetEngine();
      set((s) => ({ ...emptySpaceData(), spaces: [...s.spaces, meta], spaceId: meta.id, persistEnabled: true }));
      if (template === "sample") await get().loadSampleData();
      await persistEverything(meta.id);
    } finally {
      set({ _hydrated: true });
    }
  },

  renameSpace: async (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((s) => ({ spaces: s.spaces.map((sp) => (sp.id === id ? { ...sp, name: trimmed } : sp)) }));
    await saveSpaceIndex({ activeId: get().spaceId, spaces: get().spaces });
  },

  deleteSpace: async (id) => {
    const remaining = get().spaces.filter((s) => s.id !== id);
    if (id === get().spaceId) {
      if (remaining.length > 0) {
        await get().switchSpace(remaining[0].id);
      } else {
        // Never leave the user without a space: start a fresh Playground.
        await get().createSpace(PLAYGROUND_NAME, "sample");
      }
    }
    set((s) => ({ spaces: s.spaces.filter((sp) => sp.id !== id) }));
    await deleteSpaceData(id);
    await saveSpaceIndex({ activeId: get().spaceId, spaces: get().spaces });
  },

  tables: [],
  views: [],
  fileEntries: [],
  unrestoredFiles: [],
  unrestoredViews: [],
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
    set((state) => withoutTables(state, [name]));
    try {
      const conn = await getConnection();
      await conn.query(`DROP TABLE IF EXISTS ${quoteIdent(name)}`);
    } catch (err) {
      console.error("Failed to drop table:", err);
    }
  },

  dropView: async (name) => {
    set((state) => ({ views: state.views.filter((v) => v.name !== name) }));
    try {
      const conn = await getConnection();
      await conn.query(`DROP VIEW IF EXISTS ${quoteIdent(name)}`);
    } catch (err) {
      console.error("Failed to drop view:", err);
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
      if (!response.ok) throw new Error(`Could not fetch sample ${fileName} (HTTP ${response.status})`);
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

  syncCatalog: async (touched = new Set()) => {
    const { readCatalog, describeRelation, snapshotTable } = await import("@/lib/duckdb/catalog");
    const catalog = await readCatalog();
    const present = new Set(catalog.tables);
    const gone = get().tables.filter((t) => !present.has(t.name)).map((t) => t.name);
    if (gone.length > 0) set((state) => withoutTables(state, gone));

    for (const name of catalog.tables) {
      const known = get().tables.find((t) => t.name === name);
      const info = await describeRelation(name);
      const changed =
        !known ||
        touched.has(name.toLowerCase()) ||
        known.rowCount !== info.rowCount ||
        columnSignature(known) !== columnSignature(info);
      if (!changed) continue;
      try {
        get().addTable(info, `${name}.parquet`, await snapshotTable(name, info.columns));
      } catch (err) {
        console.error(`Could not save a snapshot of ${name}:`, err);
        set((state) => ({ tables: [...state.tables.filter((t) => t.name !== name), info] }));
      }
    }

    const views: ViewInfo[] = [];
    const broken: { name: string; sql: string }[] = [];
    for (const view of catalog.views) {
      try {
        views.push({ ...(await describeRelation(view.name, false)), sql: view.sql });
      } catch (err) {
        // e.g. its base table was dropped; keep the definition so it isn't lost on save.
        console.error(`Could not describe view ${view.name}:`, err);
        broken.push(view);
      }
    }
    const inEngine = new Set(catalog.views.map((v) => v.name));
    set((state) => ({
      views,
      unrestoredViews: [...state.unrestoredViews.filter((v) => !inEngine.has(v.name)), ...broken],
    }));
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
    await flushPendingSave();
    await resetEngine();
    const { spaceId, persistEnabled } = get();
    // On a shared link the saved spaces belong to this browser's owner — leave them alone.
    if (persistEnabled && spaceId) await deleteSpaceData(spaceId);
    set({ ...emptySpaceData() });
    if (persistEnabled && spaceId) await persistEverything(spaceId);
  },

  tabs: initialSpace.tabs,
  activeTabId: initialSpace.activeTabId,

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
    const [{ executeQuery, splitStatements }, { isReadOnlyStatement, mutationTargets }] = await Promise.all([
      import("@/lib/duckdb/queries"),
      import("@/lib/duckdb/catalog-sql"),
    ]);
    const statements = splitStatements(text);
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
    // Re-running the same SQL moves it to the top instead of duplicating it.
    set((state) => ({
      history: [entry, ...state.history.filter((h) => h.sql !== text)].slice(0, MAX_HISTORY),
    }));

    // DDL/DML (even a batch that failed part-way) may have created, changed or dropped tables.
    if (statements.some((s) => !isReadOnlyStatement(s))) {
      try {
        await get().syncCatalog(mutationTargets(statements));
      } catch (err) {
        console.error("Catalog sync failed:", err);
      }
    }
  },

  appendAiTurn: (tabId, turn) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, aiThread: [...(t.aiThread ?? []), turn].slice(-30) } : t
      ),
    })),

  clearAiThread: (tabId) => get().updateTab(tabId, { aiThread: [] }),

  history: [],
  clearHistory: () => set({ history: [] }),

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

// --- Helpers -------------------------------------------------------------------------

function newMeta(name: string): SpaceMeta {
  const now = Date.now();
  return { id: newSpaceId(), name, createdAt: now, updatedAt: now, tableCount: 0 };
}

function withoutTables(state: WorkspaceState, names: string[]): Partial<WorkspaceState> {
  const drop = new Set(names);
  const tableProfiles = { ...state.tableProfiles };
  for (const name of names) delete tableProfiles[name];
  return {
    tables: state.tables.filter((t) => !drop.has(t.name)),
    fileEntries: state.fileEntries.filter((f) => !drop.has(f.name)),
    unrestoredFiles: state.unrestoredFiles.filter((f) => !drop.has(f.name)),
    tableProfiles,
    discovery: IDLE_DISCOVERY,
    relationshipOverrides: state.relationshipOverrides.filter(
      (rel) => !drop.has(rel.from.table) && !drop.has(rel.to.table)
    ),
  };
}

/** Drop every user table/view from DuckDB and forget profiles in flight. */
async function resetEngine(): Promise<void> {
  profilesInFlight.clear();
  const { resetDatabase } = await import("@/lib/duckdb/catalog");
  await resetDatabase();
}

/** Spaces are per-browser; a live room is tied to the tabs of the space you started it in. */
async function leaveRoom(): Promise<void> {
  const { useCollaborationStore } = await import("@/stores/collaboration-store");
  if (!useCollaborationStore.getState().roomId) return;
  const { disconnectFromRoom } = await import("@/lib/collaboration/sync");
  disconnectFromRoom();
  toast("Left the live room — rooms belong to the space you started them in.", "info");
}

/** Load a saved space into DuckDB and the store. */
async function openSpace(spaceId: string): Promise<void> {
  const store = useWorkspaceStore;
  const persisted = await loadSpace(spaceId);
  if (!persisted) return;

  // Plugins first: a plugin may be the file loader for some saved files.
  if (persisted.pluginUrls?.length) {
    const { loadPluginFromUrl } = await import("@/lib/plugins/registry");
    for (const url of persisted.pluginUrls) {
      try {
        const plugin = await loadPluginFromUrl(url);
        store.setState((s) => ({
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

  const views: ViewInfo[] = [];
  const unrestoredViews: { name: string; sql: string }[] = [];
  if (persisted.views?.length) {
    const { restoreViews, describeRelation } = await import("@/lib/duckdb/catalog");
    const failed = new Set((await restoreViews(persisted.views)).map((v) => v.name));
    for (const view of persisted.views) {
      if (failed.has(view.name)) {
        unrestoredViews.push(view);
        continue;
      }
      try {
        views.push({ ...(await describeRelation(view.name, false)), sql: view.sql });
      } catch {
        // dropped by a later restore step; ignore
      }
    }
    if (failed.size > 0) toast(`Couldn't recreate view${failed.size > 1 ? "s" : ""} ${[...failed].join(", ")}.`, "warning");
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
    aiThread: pt.aiThread ?? [],
  }));

  store.setState({
    tables,
    views,
    fileEntries,
    unrestoredFiles,
    unrestoredViews,
    tableProfiles: Object.fromEntries(
      tables.map((t) => [t.name, { status: "idle", profile: null, error: null }])
    ),
    ...(tabs.length > 0 && {
      tabs,
      activeTabId: tabs.some((t) => t.id === persisted.activeTabId) ? persisted.activeTabId! : tabs[0].id,
    }),
    history: persisted.history ?? [],
    ...(persisted.pipelines?.length && {
      pipelines: persisted.pipelines,
      activePipelineId: persisted.activePipelineId ?? persisted.pipelines[0].id,
    }),
    viewMode: persisted.viewMode ?? "sql",
    relationshipVerdicts: persisted.relationshipVerdicts ?? {},
    relationshipOverrides: persisted.relationshipOverrides ?? [],
  });
}

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
// State (tabs, history, pipelines, verdicts…) is debounced; file bytes are written once
// when a table appears or changes and deleted when it goes away. Writes always target
// the space that was active when the change happened.

let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** Counts local edits, so a pull can tell if one happened while it was fetching. */
let localEdits = 0;
let pendingSave: (() => Promise<void>) | null = null;

function snapshotState(): PersistedState {
  const s = useWorkspaceStore.getState();
  return {
    files: [...s.fileEntries.map(({ name, fileName }) => ({ name, fileName })), ...s.unrestoredFiles],
    views: [...s.views.map(({ name, sql }) => ({ name, sql })), ...s.unrestoredViews],
    tabs: s.tabs.map(({ id, title, query, createdAt, aiThread }) => ({ id, title, query, createdAt, aiThread })),
    activeTabId: s.activeTabId,
    history: s.history,
    pipelines: s.pipelines,
    activePipelineId: s.activePipelineId,
    viewMode: s.viewMode,
    pluginUrls: s.plugins.filter((p) => p.url).map((p) => p.url),
    relationshipVerdicts: s.relationshipVerdicts,
    relationshipOverrides: s.relationshipOverrides,
  };
}

/** Write the state record and refresh the space's entry (updated time, table count). */
async function saveStateNow(spaceId: string, force = false): Promise<void> {
  // A debounced save that fires mid-switch must not write another space's state.
  const current = useWorkspaceStore.getState();
  if (!force && (current.spaceId !== spaceId || !current._hydrated || !current.persistEnabled)) return;
  await saveSpaceState(spaceId, snapshotState());
  const tableCount = useWorkspaceStore.getState().tables.length;
  useWorkspaceStore.setState((s) => ({
    spaces: s.spaces.map((sp) => (sp.id === spaceId ? { ...sp, updatedAt: Date.now(), tableCount } : sp)),
  }));
  const { spaceId: activeId, spaces } = useWorkspaceStore.getState();
  await saveSpaceIndex({ activeId, spaces });
}

/** Save every file plus the state under `spaceId` (new spaces, copies, adopted shares). */
async function persistEverything(spaceId: string): Promise<void> {
  for (const entry of useWorkspaceStore.getState().fileEntries) await saveSpaceFile(spaceId, entry);
  await saveStateNow(spaceId, true);
}

/** Run a debounced state save immediately (before switching spaces). */
async function flushPendingSave(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const run = pendingSave;
  pendingSave = null;
  if (run) await run();
}

/** Persist a shared link's data as a brand-new space and make it active. */
export async function saveSharedAsSpace(name: string): Promise<void> {
  const index = await loadSpaceIndex();
  const meta = newMeta(name);
  useWorkspaceStore.setState({ spaces: [...index.spaces, meta], spaceId: meta.id, persistEnabled: true });
  await persistEverything(meta.id);
}

useWorkspaceStore.subscribe((state, prev) => {
  const spaceId = state.spaceId;
  if (applyingRemote) return;
  if (!spaceId || !state._hydrated || !state.persistEnabled) return;
  if (!prev._hydrated || !prev.persistEnabled || prev.spaceId !== spaceId) return;

  if (state.fileEntries !== prev.fileEntries) {
    const prevByName = new Map(prev.fileEntries.map((f) => [f.name, f]));
    const nextNames = new Set(state.fileEntries.map((f) => f.name));
    for (const entry of state.fileEntries) {
      if (prevByName.get(entry.name) !== entry) saveSpaceFile(spaceId, entry).catch(console.error);
    }
    deleteSpaceFiles(spaceId, [...prevByName.keys()].filter((n) => !nextNames.has(n))).catch(console.error);
  }

  if (
    state.fileEntries !== prev.fileEntries ||
    state.unrestoredFiles !== prev.unrestoredFiles ||
    state.unrestoredViews !== prev.unrestoredViews ||
    state.views !== prev.views ||
    state.tabs !== prev.tabs ||
    state.activeTabId !== prev.activeTabId ||
    state.history !== prev.history ||
    state.pipelines !== prev.pipelines ||
    state.activePipelineId !== prev.activePipelineId ||
    state.viewMode !== prev.viewMode ||
    state.plugins !== prev.plugins ||
    state.relationshipVerdicts !== prev.relationshipVerdicts ||
    state.relationshipOverrides !== prev.relationshipOverrides
  ) {
    localEdits += 1;
    if (saveTimer) clearTimeout(saveTimer);
    pendingSave = () => saveStateNow(spaceId).catch(console.error);
    saveTimer = setTimeout(() => void flushPendingSave(), 400);
  }
});

// --- Live sync ---------------------------------------------------------------------
// With server storage, other devices may change the same spaces. Poll for their changes
// and apply them here: state-only edits (tabs, history, verdicts…) in place, anything that
// touches tables, views or plugins by reopening the space. Never pull over unsaved work.

const SYNC_INTERVAL_MS = 3000;
/** Set while remote state is applied, so the save subscription doesn't echo it back. */
let applyingRemote = false;
let pulling = false;

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

function hasLocalChanges(): boolean {
  return saveTimer !== null || pendingSave !== null || hasPendingWrites();
}

async function inLiveRoom(): Promise<boolean> {
  const { useCollaborationStore } = await import("@/stores/collaboration-store");
  return useCollaborationStore.getState().roomId !== null;
}

/** Merge saved tabs into the open ones, keeping this device's results and active tab. */
function applyRemoteState(remote: PersistedState): void {
  const s = useWorkspaceStore.getState();
  const localById = new Map(s.tabs.map((t) => [t.id, t]));
  const tabs = (remote.tabs ?? []).map((pt) => {
    const local = localById.get(pt.id);
    const base = local ?? { ...createTab(1, pt.query), id: pt.id, createdAt: pt.createdAt };
    return { ...base, title: pt.title, query: pt.query, aiThread: pt.aiThread ?? [] };
  });
  const pipelines = remote.pipelines ?? [];
  applyingRemote = true;
  try {
    useWorkspaceStore.setState({
      ...(tabs.length > 0 && {
        tabs,
        activeTabId: tabs.some((t) => t.id === s.activeTabId) ? s.activeTabId : tabs[0].id,
      }),
      history: remote.history ?? [],
      pipelines,
      activePipelineId: pipelines.some((p) => p.id === s.activePipelineId)
        ? s.activePipelineId
        : (pipelines[0]?.id ?? null),
      relationshipVerdicts: remote.relationshipVerdicts ?? {},
      relationshipOverrides: remote.relationshipOverrides ?? [],
    });
  } finally {
    applyingRemote = false;
  }
}

/** Reload the open space from storage (tables, views and plugins changed elsewhere). */
async function reopenSpace(spaceId: string): Promise<void> {
  const keepTab = useWorkspaceStore.getState().activeTabId;
  useWorkspaceStore.setState({ _hydrated: false });
  try {
    await resetEngine();
    useWorkspaceStore.setState({ ...emptySpaceData(), spaceId });
    await openSpace(spaceId);
    if (useWorkspaceStore.getState().tabs.some((t) => t.id === keepTab)) {
      useWorkspaceStore.setState({ activeTabId: keepTab });
    }
    useWorkspaceStore.setState({ _hydrated: true });
  } catch (err) {
    console.error("Failed to reload the space:", err);
    // Never resume saving over a half-loaded space; the saved copy is intact, so reload it.
    window.location.reload();
  }
}

async function pullRemoteChanges(): Promise<void> {
  const ready = () => {
    const s = useWorkspaceStore.getState();
    return s._hydrated && s.persistEnabled && s.spaceId !== null && !hasLocalChanges();
  };
  if (pulling || !ready()) return;
  pulling = true;
  const editsAtStart = localEdits;
  try {
    const spaceId = useWorkspaceStore.getState().spaceId!;
    const changes = await checkRemote(spaceId);
    if (changes?.snippetsChanged) {
      void import("@/stores/snippet-store").then((m) => m.useSnippetStore.getState().refresh());
    }
    if (!changes || !ready() || useWorkspaceStore.getState().spaceId !== spaceId) return;

    if (changes.spaces) {
      const remoteSpaces = changes.spaces;
      changes.ack();
      if (remoteSpaces.some((sp) => sp.id === spaceId)) {
        useWorkspaceStore.setState({ spaces: remoteSpaces });
      } else if (remoteSpaces.length > 0) {
        // The open space was deleted on another device: move to one that still exists.
        useWorkspaceStore.setState({ spaces: remoteSpaces });
        toast("This space was deleted on another device.", "info");
        await useWorkspaceStore.getState().switchSpace(remoteSpaces[0].id);
        return;
      }
    }

    if (!changes.spaceChanged || (await inLiveRoom())) return;
    const pulled = await pullSpaceState(spaceId);
    // An edit made while fetching is newer than what came back; it will be saved instead.
    if (!pulled || !ready() || localEdits !== editsAtStart || useWorkspaceStore.getState().spaceId !== spaceId) return;
    const s = useWorkspaceStore.getState();
    const local = snapshotState();
    const needsReopen =
      pulled.filesChanged ||
      !sameJson(pulled.state.files, local.files) ||
      !sameJson(pulled.state.views, local.views) ||
      !sameJson(pulled.state.pluginUrls, local.pluginUrls);
    if (needsReopen) {
      await reopenSpace(spaceId);
    } else if (s.tabs.length > 0) {
      applyRemoteState(pulled.state);
    }
  } catch (err) {
    console.error("Live sync failed:", err);
  } finally {
    pulling = false;
  }
}

if (typeof window !== "undefined") {
  const pull = () => {
    if (document.visibilityState === "visible") void pullRemoteChanges();
  };
  setInterval(pull, SYNC_INTERVAL_MS);
  document.addEventListener("visibilitychange", pull);
  window.addEventListener("focus", pull);
}

// Publish the join graph inside DuckDB (querypad.relationships / querypad.keys) so it
// can be queried with SQL and referenced by the AI assistant.
let publishTimer: ReturnType<typeof setTimeout> | null = null;
useWorkspaceStore.subscribe((state, prev) => {
  if (state.discovery.status !== "ready") return;
  if (state.discovery === prev.discovery && state.relationshipVerdicts === prev.relationshipVerdicts) return;
  if (publishTimer) clearTimeout(publishTimer);
  publishTimer = setTimeout(async () => {
    try {
      const { relationshipsSql } = await import("@/lib/duckdb/catalog-sql");
      const s = useWorkspaceStore.getState();
      if (s.discovery.status !== "ready") return;
      const conn = await getConnection();
      for (const statement of relationshipsSql(s.discovery.relationships, s.relationshipVerdicts, relationshipKey)) {
        await conn.query(statement);
      }
    } catch (err) {
      console.error("Failed to publish relationships:", err);
    }
  }, 150);
});
