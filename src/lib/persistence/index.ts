import * as browser from "./browser";
import type { FileEntry, LoadedSpace, PersistedState, SpaceIndex, SpaceMeta } from "./browser";

export type {
  FileEntry,
  LoadedSpace,
  PersistedState,
  PersistedTab,
  PersistedHistoryEntry,
  SpaceIndex,
  SpaceMeta,
} from "./browser";
export { newSpaceId } from "./browser";

/**
 * Workspace persistence. When the app is served with its storage API (`/api/store`),
 * spaces live on the server so every device sees the same workspace; otherwise (static
 * hosting, API unreachable) they stay in this browser's IndexedDB.
 *
 * Server records carry revs. We remember the revs this client has seen or produced so
 * the live-sync loop can tell a change made elsewhere from an echo of our own write.
 */

interface RemoteStatus {
  index: SpaceIndex & { rev: number };
  revs: Record<string, number>;
}

interface RemoteSpace {
  rev: number;
  state: PersistedState;
  files: Record<string, string>;
}

let backend: Promise<"server" | "browser"> | null = null;
let indexRev = 0;
const ownIndexRevs = new Set<number>();
const spaceRevs = new Map<string, number>();
const ownSpaceRevs = new Map<string, Set<number>>();
/** File version tags ("size:mtime") per space, as last seen or written by this client. */
const fileVersions = new Map<string, Map<string, string>>();
let inFlight = 0;
let pendingIndexRev = 0;
/** The space list as this client last sent or adopted it; saves send only the difference. */
let syncedSpaces = new Map<string, string>();

function rememberSpaces(spaces: SpaceMeta[]) {
  syncedSpaces = new Map(spaces.map((sp) => [sp.id, JSON.stringify(sp)]));
}

function serverStorage(): Promise<boolean> {
  backend ??= fetch("/api/store", { cache: "no-store" })
    .then((r) => (r.ok ? "server" : "browser"))
    .catch(() => "browser" as const);
  return backend.then((b) => b === "server");
}

export async function isServerBacked(): Promise<boolean> {
  return serverStorage();
}

/** True while a write to the server is still on its way (don't pull over it). */
export function hasPendingWrites(): boolean {
  return inFlight > 0;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  inFlight += init?.method && init.method !== "GET" ? 1 : 0;
  try {
    const res = await fetch(url, { cache: "no-store", ...init });
    if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${url} failed (${res.status})`);
    return (await res.json()) as T;
  } finally {
    inFlight -= init?.method && init.method !== "GET" ? 1 : 0;
  }
}

const spaceUrl = (id: string) => `/api/store/spaces/${encodeURIComponent(id)}`;
const fileUrl = (id: string, name: string) => `${spaceUrl(id)}/files/${encodeURIComponent(name)}`;

/** Advance `known` over a run of revs we produced ourselves. */
function advance(known: number, own: Set<number>): number {
  while (own.delete(known + 1)) known += 1;
  for (const rev of own) if (rev <= known) own.delete(rev);
  return known;
}

function recordIndexWrite(rev: number) {
  ownIndexRevs.add(rev);
  indexRev = advance(indexRev, ownIndexRevs);
}

function recordSpaceWrite(id: string, rev: number) {
  const own = ownSpaceRevs.get(id) ?? new Set<number>();
  own.add(rev);
  ownSpaceRevs.set(id, own);
  spaceRevs.set(id, advance(spaceRevs.get(id) ?? 0, own));
}

function versionsOf(id: string): Map<string, string> {
  let map = fileVersions.get(id);
  if (!map) fileVersions.set(id, (map = new Map()));
  return map;
}

export async function loadSpaceIndex(): Promise<SpaceIndex> {
  if (!(await serverStorage())) return browser.loadSpaceIndex();
  const status = await request<RemoteStatus>("/api/store");
  indexRev = status.index.rev;
  rememberSpaces(status.index.spaces);
  if (status.index.spaces.length > 0) return { activeId: status.index.activeId, spaces: status.index.spaces };
  // First server visit from this browser: carry its existing spaces over.
  const local = await browser.loadSpaceIndex();
  if (local.spaces.length === 0) return local;
  for (const meta of local.spaces) {
    const space = await browser.loadSpace(meta.id);
    if (!space) continue;
    const { fileEntries, ...state } = space;
    for (const entry of fileEntries) await saveSpaceFile(meta.id, entry);
    await saveSpaceState(meta.id, state);
  }
  await saveSpaceIndex(local);
  return local;
}

export async function saveSpaceIndex(index: SpaceIndex): Promise<void> {
  if (!(await serverStorage())) return browser.saveSpaceIndex(index);
  // Send only this device's changes, so a save never undoes another device's edits.
  const upsert = index.spaces.filter((sp) => syncedSpaces.get(sp.id) !== JSON.stringify(sp));
  const ids = new Set(index.spaces.map((sp) => sp.id));
  const remove = [...syncedSpaces.keys()].filter((id) => !ids.has(id));
  rememberSpaces(index.spaces);
  const { rev } = await request<{ rev: number }>("/api/store", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activeId: index.activeId, upsert, remove }),
  });
  recordIndexWrite(rev);
}

export async function saveSpaceState(spaceId: string, state: PersistedState): Promise<void> {
  if (!(await serverStorage())) return browser.saveSpaceState(spaceId, state);
  const { rev } = await request<{ rev: number }>(spaceUrl(spaceId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  recordSpaceWrite(spaceId, rev);
}

export async function saveSpaceFile(spaceId: string, entry: FileEntry): Promise<void> {
  if (!(await serverStorage())) return browser.saveSpaceFile(spaceId, entry);
  const { rev, version } = await request<{ rev: number; version: string }>(fileUrl(spaceId, entry.name), {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(entry.data),
  });
  versionsOf(spaceId).set(entry.name, version);
  recordSpaceWrite(spaceId, rev);
}

export async function deleteSpaceFiles(spaceId: string, names: string[]): Promise<void> {
  if (!(await serverStorage())) return browser.deleteSpaceFiles(spaceId, names);
  for (const name of names) {
    const { rev } = await request<{ rev: number }>(fileUrl(spaceId, name), { method: "DELETE" });
    versionsOf(spaceId).delete(name);
    recordSpaceWrite(spaceId, rev);
  }
}

export async function loadSpace(spaceId: string): Promise<LoadedSpace | undefined> {
  if (!(await serverStorage())) return browser.loadSpace(spaceId);
  const remote = await fetchSpace(spaceId);
  if (!remote) return undefined;
  const fileEntries: FileEntry[] = [];
  for (const { name, fileName } of remote.state.files ?? []) {
    if (!(name in remote.files)) continue;
    const res = await fetch(fileUrl(spaceId, name), { cache: "no-store" });
    if (res.ok) fileEntries.push({ name, fileName, data: new Uint8Array(await res.arrayBuffer()) });
  }
  return { ...remote.state, fileEntries };
}

export async function deleteSpaceData(spaceId: string): Promise<void> {
  if (!(await serverStorage())) return browser.deleteSpaceData(spaceId);
  await request(spaceUrl(spaceId), { method: "DELETE" });
  spaceRevs.delete(spaceId);
  fileVersions.delete(spaceId);
}

// --- Live sync helpers ---------------------------------------------------------------

/** Fetch a space's state and remember its rev and file versions as seen. */
async function fetchSpace(spaceId: string): Promise<RemoteSpace | null> {
  const res = await fetch(spaceUrl(spaceId), { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET space ${spaceId} failed (${res.status})`);
  const remote = (await res.json()) as RemoteSpace;
  spaceRevs.set(spaceId, Math.max(spaceRevs.get(spaceId) ?? 0, remote.rev));
  fileVersions.set(spaceId, new Map(Object.entries(remote.files)));
  return remote;
}

export interface RemoteChanges {
  /** The new space list, if another device changed it. */
  spaces: SpaceMeta[] | null;
  /** Call once the new space list has been applied. */
  ack: () => void;
  /** True when the given space was written by another device since we last looked. */
  spaceChanged: boolean;
}

/** What changed on the server since this client last saw it (null when browser-only). */
export async function checkRemote(spaceId: string | null): Promise<RemoteChanges | null> {
  if (!(await serverStorage())) return null;
  const status = await request<RemoteStatus>("/api/store");
  const spaces = status.index.rev > indexRev ? status.index.spaces : null;
  pendingIndexRev = status.index.rev;
  const rev = spaceId ? status.revs[spaceId] : undefined;
  const spaceChanged = rev !== undefined && rev > (spaceRevs.get(spaceId!) ?? 0);
  const ack = () => {
    indexRev = Math.max(indexRev, pendingIndexRev);
    if (spaces) rememberSpaces(spaces);
  };
  return { spaces, spaceChanged, ack };
}

/**
 * Pull a space's latest state. `filesChanged` says whether any table bytes differ from
 * what this client loaded or wrote, in which case the engine must be reloaded.
 */
export async function pullSpaceState(
  spaceId: string
): Promise<{ state: PersistedState; filesChanged: boolean } | null> {
  const before = new Map(versionsOf(spaceId));
  const remote = await fetchSpace(spaceId);
  if (!remote) return null;
  const after = Object.entries(remote.files);
  const filesChanged = after.length !== before.size || after.some(([name, v]) => before.get(name) !== v);
  return { state: remote.state, filesChanged };
}
