import type * as Yjs from "yjs";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { loadBufferAsTable } from "@/lib/duckdb/files";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // per file
// Whole-room budget: a joining peer receives every file in one sync message, which must
// stay under the relay's max payload (COLLAB_MAX_PAYLOAD_BYTES, default 32MB).
const MAX_ROOM_FILE_BYTES = 24 * 1024 * 1024;

interface SharedFile {
  name: string;
  fileName: string;
  data: Uint8Array;
}

let stopCurrent: (() => void) | null = null;

function filesMap(ydoc: Yjs.Doc) {
  return ydoc.getMap<SharedFile>("files");
}

function bytesEqual(a: Uint8Array, b: Uint8Array) {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

function publish(ydoc: Yjs.Doc, name: string, fileName: string, data: Uint8Array) {
  if (data.byteLength > MAX_FILE_SIZE) {
    console.warn(`File ${fileName} exceeds 5MB, not syncing to peers`);
    return;
  }
  const yFiles = filesMap(ydoc);
  const existing = yFiles.get(name);
  if (existing && existing.fileName === fileName && bytesEqual(existing.data, data)) return;

  let roomBytes = 0;
  yFiles.forEach((file, key) => {
    if (key !== name) roomBytes += file.data.byteLength;
  });
  if (roomBytes + data.byteLength > MAX_ROOM_FILE_BYTES) {
    console.warn(`Room file budget (24MB) exceeded, not syncing ${fileName} to peers`);
    return;
  }
  // Copy: the store's buffer may later be transferred to the DuckDB worker.
  yFiles.set(name, { name, fileName, data: new Uint8Array(data) });
}

/**
 * Start two-way file sync for the current room: publish existing and newly added
 * workspace files, and load peers' files that aren't present locally.
 * Idempotent; called by connectToRoom. Stopped by stopFileSync / disconnectFromRoom.
 */
export function startFileSync() {
  if (stopCurrent) return;
  const ydoc = useCollaborationStore.getState().ydoc as Yjs.Doc | null;
  if (!ydoc) return;

  const yFiles = filesMap(ydoc);
  const loading = new Set<string>();
  let stopped = false;

  const loadMissing = (keys: Iterable<string>) => {
    const { tables, fileEntries } = useWorkspaceStore.getState();
    const local = new Set([...tables.map((t) => t.name), ...fileEntries.map((f) => f.name)]);
    for (const key of keys) {
      const file = yFiles.get(key);
      if (!file || local.has(key) || loading.has(key)) continue;
      loading.add(key);
      loadBufferAsTable(file.name, file.fileName, new Uint8Array(file.data))
        .then((table) => {
          if (!stopped) useWorkspaceStore.getState().addTable(table, file.fileName, file.data);
        })
        .catch((err) => console.error(`Failed to load remote file ${file.fileName}:`, err))
        .finally(() => loading.delete(key));
    }
  };

  // Publish what we already have, then pull what the room has.
  ydoc.transact(() => {
    for (const entry of useWorkspaceStore.getState().fileEntries) {
      publish(ydoc, entry.name, entry.fileName, entry.data);
    }
  });
  loadMissing(Array.from(yFiles.keys()));

  const onRemote = (event: Yjs.YMapEvent<SharedFile>) => {
    if (event.transaction.local) return;
    loadMissing(event.keysChanged);
  };
  yFiles.observe(onRemote);

  const unsubscribe = useWorkspaceStore.subscribe((state, prev) => {
    if (state.fileEntries === prev.fileEntries) return;
    for (const entry of state.fileEntries) {
      if (!prev.fileEntries.includes(entry)) publish(ydoc, entry.name, entry.fileName, entry.data);
    }
  });

  stopCurrent = () => {
    stopped = true;
    yFiles.unobserve(onRemote);
    unsubscribe();
  };
}

/** Stop file sync (no-op if not running). */
export function stopFileSync() {
  stopCurrent?.();
  stopCurrent = null;
}

