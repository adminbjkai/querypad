import { get, set, del, delMany, keys } from "idb-keyval";
import type { Pipeline } from "@/types/pipeline";
import type { Relationship, RelationshipVerdict } from "@/types/discovery";

/**
 * Persistence layout (IndexedDB via idb-keyval):
 *   querypad-workspace        → small JSON-ish state (tabs, pipelines, verdicts, file index)
 *   querypad-file:<tableName> → raw file bytes, written once per file
 * Keeping bytes out of the state record means typing in the editor never rewrites
 * (potentially 100 MB) file buffers.
 */
const WORKSPACE_KEY = "querypad-workspace";
const FILE_PREFIX = "querypad-file:";

export interface PersistedTab {
  id: string;
  title: string;
  query: string;
  createdAt: number;
}

export interface FileEntry {
  name: string;
  fileName: string;
  data: Uint8Array;
}

export interface PersistedState {
  files?: { name: string; fileName: string }[];
  tabs?: PersistedTab[];
  activeTabId?: string;
  pipelines?: Pipeline[];
  activePipelineId?: string | null;
  viewMode?: "sql" | "pipeline";
  pluginUrls?: string[];
  relationshipVerdicts?: Record<string, RelationshipVerdict>;
  relationshipOverrides?: Relationship[];
  /** Pre-0.7 records stored file bytes inline and a single `query`. */
  fileEntries?: FileEntry[];
  query?: string;
}

export interface LoadedWorkspace extends PersistedState {
  fileEntries: FileEntry[];
}

export async function saveState(state: Omit<PersistedState, "fileEntries" | "query">): Promise<void> {
  await set(WORKSPACE_KEY, state);
}

export async function saveFile(entry: FileEntry): Promise<void> {
  // Copy so the stored buffer can never be detached by a later DuckDB transfer.
  await set(FILE_PREFIX + entry.name, {
    name: entry.name,
    fileName: entry.fileName,
    data: new Uint8Array(entry.data),
  });
}

export async function deleteFiles(names: string[]): Promise<void> {
  if (names.length > 0) await delMany(names.map((n) => FILE_PREFIX + n));
}

export async function loadWorkspace(): Promise<LoadedWorkspace | undefined> {
  const state = await get<PersistedState>(WORKSPACE_KEY);
  if (!state) return undefined;

  // Legacy single-record format: bytes inline. Migrate them out on load.
  if (state.fileEntries && !state.files) {
    for (const entry of state.fileEntries) await saveFile(entry);
    const tabs = state.tabs ?? [
      { id: crypto.randomUUID(), title: "Query 1", query: state.query ?? "", createdAt: Date.now() },
    ];
    const migrated: PersistedState = {
      ...state,
      tabs,
      files: state.fileEntries.map(({ name, fileName }) => ({ name, fileName })),
    };
    delete migrated.fileEntries;
    delete migrated.query;
    await saveState(migrated);
    return { ...migrated, fileEntries: state.fileEntries };
  }

  const fileEntries: FileEntry[] = [];
  for (const { name } of state.files ?? []) {
    const entry = await get<FileEntry>(FILE_PREFIX + name);
    if (entry) fileEntries.push(entry);
  }
  return { ...state, fileEntries };
}

export async function clearPersistedWorkspace(): Promise<void> {
  const fileKeys = (await keys()).filter(
    (k) => typeof k === "string" && k.startsWith(FILE_PREFIX)
  );
  await delMany(fileKeys);
  await del(WORKSPACE_KEY);
}
