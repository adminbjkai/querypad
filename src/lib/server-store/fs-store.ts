import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";

/**
 * Server-side workspace storage, so spaces follow the user to every device.
 *
 *   <root>/<ns>/index.json                     → { rev, activeId, spaces }
 *   <root>/<ns>/spaces/<id>/state.json         → { rev, state }
 *   <root>/<ns>/spaces/<id>/files/<b64(name)>  → raw table bytes
 *
 * `rev` counters let open clients notice changes made elsewhere. A space's rev bumps on
 * every state or file write. <ns> is "default" unless a `querypad_ns` cookie picks another
 * (used by the e2e suite to keep parallel tests apart).
 */
const ROOT = process.env.QUERYPAD_DATA_DIR || path.join(process.cwd(), ".querypad-data");
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export interface StoredIndex {
  rev: number;
  activeId: string | null;
  spaces: { id: string }[];
  /** Ids of deleted spaces; never revived by a device that hasn't seen the deletion yet. */
  deleted?: string[];
}

/** A change to the space list. Devices send only what they changed, never the whole list. */
export interface IndexPatch {
  activeId?: string | null;
  upsert?: { id: string }[];
  remove?: string[];
}

export interface StoredSpace {
  rev: number;
  state: Record<string, unknown>;
  /** Per-file version tags ("size:mtime") so clients can tell when bytes changed. */
  files: Record<string, string>;
}

export interface WriteResult {
  rev: number;
  /** The rev before this write; a gap to the caller's known rev means someone else wrote. */
  prevRev: number;
}

export function isSafeId(id: string): boolean {
  return SAFE_ID.test(id);
}

export function namespaceFrom(cookieValue: string | undefined): string {
  return cookieValue && SAFE_ID.test(cookieValue) ? cookieValue : "default";
}

const nsDir = (ns: string) => path.join(ROOT, ns);
const spaceDir = (ns: string, id: string) => path.join(nsDir(ns), "spaces", id);
const filesDir = (ns: string, id: string) => path.join(spaceDir(ns, id), "files");
const encodeName = (name: string) => Buffer.from(name, "utf8").toString("base64url");
const decodeName = (encoded: string) => Buffer.from(encoded, "base64url").toString("utf8");

// One writer at a time per namespace: rev bumps are read-modify-write.
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(ns: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(ns) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(ns, next.catch(() => undefined));
  return next;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Records polled by every open client (index, space revs, snippets) are parsed once per version:
 * writes replace the file (temp + rename), so a changed inode, size or mtime means a new version.
 * `pick` keeps only what callers need (e.g. a space's rev, not its whole state).
 */
const parsed = new Map<string, { version: string; value: unknown }>();
async function readJsonCached<T>(file: string, pick: (record: never) => T = (record) => record as T): Promise<T | null> {
  let version: string;
  try {
    const info = await stat(file);
    version = `${info.ino}:${info.size}:${info.mtimeMs}`;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    parsed.delete(file);
    return null;
  }
  const hit = parsed.get(file);
  if (hit?.version === version) return hit.value as T;
  const record = await readJson<never>(file);
  if (record === null) return null;
  const value = pick(record);
  parsed.set(file, { version, value });
  return value;
}

/** Write via a temp file + rename so readers never see a half-written record. */
async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(value));
  await rename(tmp, file);
}

export async function readIndex(ns: string): Promise<StoredIndex> {
  return (await readJsonCached<StoredIndex>(path.join(nsDir(ns), "index.json"))) ?? { rev: 0, activeId: null, spaces: [] };
}

export function patchIndex(ns: string, patch: IndexPatch): Promise<WriteResult & { index: StoredIndex }> {
  return withLock(ns, async () => {
    const current = await readIndex(ns);
    const deleted = new Set([...(current.deleted ?? []), ...(patch.remove ?? [])]);
    const spaces = current.spaces.filter((sp) => !deleted.has(sp.id));
    for (const meta of patch.upsert ?? []) {
      if (deleted.has(meta.id)) continue;
      const at = spaces.findIndex((sp) => sp.id === meta.id);
      if (at >= 0) spaces[at] = meta;
      else spaces.push(meta);
    }
    const activeId = patch.activeId !== undefined && !deleted.has(patch.activeId ?? "") ? patch.activeId : current.activeId;
    const rev = current.rev + 1;
    const index: StoredIndex = { rev, activeId, spaces, deleted: [...deleted] };
    await writeJson(path.join(nsDir(ns), "index.json"), index);
    return { rev, prevRev: current.rev, index };
  });
}

export async function isDeleted(ns: string, id: string): Promise<boolean> {
  return ((await readIndex(ns)).deleted ?? []).includes(id);
}

/** Current rev of every space that has saved state. */
export async function readSpaceRevs(ns: string): Promise<Record<string, number>> {
  let ids: string[];
  try {
    ids = await readdir(path.join(nsDir(ns), "spaces"));
  } catch {
    return {};
  }
  const revs: Record<string, number> = {};
  for (const id of ids) {
    const rev = await readJsonCached(path.join(spaceDir(ns, id), "state.json"), (record: { rev: number }) => record.rev);
    if (rev !== null) revs[id] = rev;
  }
  return revs;
}

async function readFileVersions(ns: string, id: string): Promise<Record<string, string>> {
  let names: string[];
  try {
    names = await readdir(filesDir(ns, id));
  } catch {
    return {};
  }
  const versions: Record<string, string> = {};
  for (const encoded of names) {
    if (encoded.endsWith(".tmp")) continue;
    const info = await stat(path.join(filesDir(ns, id), encoded));
    versions[decodeName(encoded)] = `${info.size}:${info.mtimeMs}`;
  }
  return versions;
}

export async function readSpace(ns: string, id: string): Promise<StoredSpace | null> {
  const record = await readJson<{ rev: number; state: Record<string, unknown> }>(
    path.join(spaceDir(ns, id), "state.json")
  );
  if (!record) return null;
  return { ...record, files: await readFileVersions(ns, id) };
}

/** Bump a space's rev, optionally replacing its state. Call inside the lock. */
async function bump(ns: string, id: string, state?: Record<string, unknown>): Promise<WriteResult> {
  const file = path.join(spaceDir(ns, id), "state.json");
  const current = await readJson<{ rev: number; state: Record<string, unknown> }>(file);
  const prevRev = current?.rev ?? 0;
  const rev = prevRev + 1;
  await writeJson(file, { rev, state: state ?? current?.state ?? {} });
  return { rev, prevRev };
}

export function writeSpaceState(ns: string, id: string, state: Record<string, unknown>): Promise<WriteResult> {
  return withLock(ns, () => bump(ns, id, state));
}

export async function writeSpaceFile(
  ns: string,
  id: string,
  name: string,
  body: ReadableStream<Uint8Array>
): Promise<WriteResult & { version: string }> {
  const dir = filesDir(ns, id);
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, encodeName(name));
  // Stream to disk outside the lock (files can be large); only the swap + rev bump is locked.
  const tmp = `${target}.${randomUUID()}.tmp`;
  try {
    await pipeline(Readable.fromWeb(body as import("node:stream/web").ReadableStream), createWriteStream(tmp));
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
  return withLock(ns, async () => {
    await rename(tmp, target);
    const info = await stat(target);
    return { ...(await bump(ns, id)), version: `${info.size}:${info.mtimeMs}` };
  });
}

export async function openSpaceFile(ns: string, id: string, name: string): Promise<ReadableStream | null> {
  const file = path.join(filesDir(ns, id), encodeName(name));
  try {
    await stat(file);
  } catch {
    return null;
  }
  return Readable.toWeb(createReadStream(file)) as ReadableStream;
}

export function deleteSpaceFile(ns: string, id: string, name: string): Promise<WriteResult> {
  return withLock(ns, async () => {
    await rm(path.join(filesDir(ns, id), encodeName(name)), { force: true });
    return bump(ns, id);
  });
}

export function deleteSpace(ns: string, id: string): Promise<void> {
  return withLock(ns, () => rm(spaceDir(ns, id), { recursive: true, force: true }));
}

// --- Snippet library ------------------------------------------------------------------
//   <root>/<ns>/snippets.json → { rev, snippets, deleted }
// Devices send per-snippet upserts/removals; for the same snippet the newer `updatedAt` wins.

export interface StoredSnippet {
  id: string;
  updatedAt: number;
  [key: string]: unknown;
}

export interface StoredSnippets {
  rev: number;
  snippets: StoredSnippet[];
  deleted?: string[];
}

const snippetsFile = (ns: string) => path.join(nsDir(ns), "snippets.json");

export async function readSnippets(ns: string): Promise<StoredSnippets> {
  return (await readJsonCached<StoredSnippets>(snippetsFile(ns))) ?? { rev: 0, snippets: [] };
}

export function patchSnippets(
  ns: string,
  patch: { upsert?: StoredSnippet[]; remove?: string[] }
): Promise<WriteResult> {
  return withLock(ns, async () => {
    const current = await readSnippets(ns);
    const deleted = new Set([...(current.deleted ?? []), ...(patch.remove ?? [])]);
    const byId = new Map(current.snippets.filter((sn) => !deleted.has(sn.id)).map((sn) => [sn.id, sn]));
    for (const snippet of patch.upsert ?? []) {
      if (deleted.has(snippet.id)) continue;
      const existing = byId.get(snippet.id);
      if (!existing || snippet.updatedAt >= existing.updatedAt) byId.set(snippet.id, snippet);
    }
    const rev = current.rev + 1;
    await writeJson(snippetsFile(ns), { rev, snippets: [...byId.values()], deleted: [...deleted] });
    return { rev, prevRev: current.rev };
  });
}
