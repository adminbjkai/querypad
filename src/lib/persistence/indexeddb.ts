import { get, set, delMany, keys } from "idb-keyval";
import type { Pipeline } from "@/types/pipeline";
import type { AiTurn } from "@/types";
import type { Relationship, RelationshipVerdict } from "@/types/discovery";

/**
 * Persistence layout (IndexedDB via idb-keyval). A browser holds several *spaces*:
 *   querypad-spaces                     → { activeId, spaces: SpaceMeta[] }
 *   querypad-space:<id>                 → that space's state (tabs, history, verdicts…)
 *   querypad-space-file:<id>:<table>    → raw bytes of one table, written once per change
 * Keeping bytes out of the state record means typing never rewrites large buffers.
 */
const INDEX_KEY = "querypad-spaces";
const stateKey = (spaceId: string) => `querypad-space:${spaceId}`;
const filePrefix = (spaceId: string) => `querypad-space-file:${spaceId}:`;

// Pre-0.8 single-workspace layout, migrated into a space on first load.
const LEGACY_STATE_KEY = "querypad-workspace";
const LEGACY_FILE_PREFIX = "querypad-file:";
const LEGACY_HISTORY_KEY = "querypad:history";

export interface SpaceMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  tableCount: number;
}

export interface SpaceIndex {
  activeId: string | null;
  spaces: SpaceMeta[];
}

export interface PersistedTab {
  id: string;
  title: string;
  query: string;
  createdAt: number;
  aiThread?: AiTurn[];
}

export interface FileEntry {
  name: string;
  fileName: string;
  data: Uint8Array;
}

export interface PersistedHistoryEntry {
  id: string;
  sql: string;
  at: number;
  rowCount: number | null;
  ms: number;
  error: string | null;
}

export interface PersistedState {
  files?: { name: string; fileName: string }[];
  views?: { name: string; sql: string }[];
  tabs?: PersistedTab[];
  activeTabId?: string;
  history?: PersistedHistoryEntry[];
  pipelines?: Pipeline[];
  activePipelineId?: string | null;
  viewMode?: "sql" | "pipeline";
  pluginUrls?: string[];
  relationshipVerdicts?: Record<string, RelationshipVerdict>;
  relationshipOverrides?: Relationship[];
}

export interface LoadedSpace extends PersistedState {
  fileEntries: FileEntry[];
}

/** Legacy record shapes: v0.6 stored bytes inline + one `query`; v0.7 had a files index. */
interface LegacyState extends PersistedState {
  fileEntries?: FileEntry[];
  query?: string;
}

export function newSpaceId(): string {
  return crypto.randomUUID().slice(0, 12);
}

export async function loadSpaceIndex(): Promise<SpaceIndex> {
  const index = await get<SpaceIndex>(INDEX_KEY);
  if (index) return index;
  return migrateLegacy();
}

export async function saveSpaceIndex(index: SpaceIndex): Promise<void> {
  await set(INDEX_KEY, index);
}

export async function saveSpaceState(spaceId: string, state: PersistedState): Promise<void> {
  await set(stateKey(spaceId), state);
}

export async function saveSpaceFile(spaceId: string, entry: FileEntry): Promise<void> {
  // Copy so the stored buffer can never be detached by a later DuckDB transfer.
  await set(filePrefix(spaceId) + entry.name, {
    name: entry.name,
    fileName: entry.fileName,
    data: new Uint8Array(entry.data),
  });
}

export async function deleteSpaceFiles(spaceId: string, names: string[]): Promise<void> {
  if (names.length > 0) await delMany(names.map((n) => filePrefix(spaceId) + n));
}

export async function loadSpace(spaceId: string): Promise<LoadedSpace | undefined> {
  const state = await get<PersistedState>(stateKey(spaceId));
  if (!state) return undefined;
  const fileEntries: FileEntry[] = [];
  for (const { name } of state.files ?? []) {
    const entry = await get<FileEntry>(filePrefix(spaceId) + name);
    if (entry) fileEntries.push(entry);
  }
  return { ...state, fileEntries };
}

/** Delete a space's state and every stored file. */
export async function deleteSpaceData(spaceId: string): Promise<void> {
  const prefix = filePrefix(spaceId);
  const fileKeys = (await keys()).filter((k) => typeof k === "string" && k.startsWith(prefix));
  await delMany([...fileKeys, stateKey(spaceId)]);
}

/** Move a v0.6/v0.7 single workspace into a space called "My workspace". */
async function migrateLegacy(): Promise<SpaceIndex> {
  const legacy = await get<LegacyState>(LEGACY_STATE_KEY);
  if (!legacy) return { activeId: null, spaces: [] };

  const id = newSpaceId();
  let entries: FileEntry[] = [];
  if (legacy.fileEntries) {
    entries = legacy.fileEntries;
  } else {
    for (const { name } of legacy.files ?? []) {
      const entry = await get<FileEntry>(LEGACY_FILE_PREFIX + name);
      if (entry) entries.push(entry);
    }
  }
  for (const entry of entries) await saveSpaceFile(id, entry);

  let history: PersistedHistoryEntry[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_HISTORY_KEY) ?? "[]");
    if (Array.isArray(parsed)) history = parsed;
  } catch {
    // ignore unreadable history
  }

  const tabs = legacy.tabs ?? [
    { id: crypto.randomUUID(), title: "Query 1", query: legacy.query ?? "", createdAt: Date.now() },
  ];
  const state: PersistedState = {
    ...legacy,
    tabs,
    history,
    files: entries.map(({ name, fileName }) => ({ name, fileName })),
  };
  delete (state as LegacyState).fileEntries;
  delete (state as LegacyState).query;
  await saveSpaceState(id, state);

  const now = Date.now();
  const index: SpaceIndex = {
    activeId: id,
    spaces: [{ id, name: "My workspace", createdAt: now, updatedAt: now, tableCount: entries.length }],
  };
  await saveSpaceIndex(index);

  // Only now that everything is copied, remove the old records.
  const legacyFileKeys = (await keys()).filter(
    (k) => typeof k === "string" && k.startsWith(LEGACY_FILE_PREFIX)
  );
  await delMany([...legacyFileKeys, LEGACY_STATE_KEY]);
  localStorage.removeItem(LEGACY_HISTORY_KEY);
  return index;
}
