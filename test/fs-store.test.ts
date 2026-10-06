import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// The store reads its root once at import, so point it at a scratch directory first.
const root = mkdtempSync(path.join(tmpdir(), "qp-store-"));
process.env.QUERYPAD_DATA_DIR = root;
let store: typeof import("../src/lib/server-store/fs-store");

test.before(async () => {
  store = await import("../src/lib/server-store/fs-store");
});
test.after(() => rm(root, { recursive: true, force: true }));

test("space revs follow every write (cached reads never go stale)", async () => {
  assert.deepEqual(await store.readSpaceRevs("t1"), {});
  await store.writeSpaceState("t1", "a", { tabs: [] });
  assert.deepEqual(await store.readSpaceRevs("t1"), { a: 1 });
  // Several quick writes of the same size must still each be seen.
  for (let i = 0; i < 12; i++) {
    await store.writeSpaceState("t1", "a", { tabs: [i % 10] });
    assert.equal((await store.readSpaceRevs("t1")).a, i + 2);
  }
  await store.writeSpaceState("t1", "b", {});
  assert.deepEqual(await store.readSpaceRevs("t1"), { a: 13, b: 1 });
  assert.deepEqual((await store.readSpace("t1", "a"))?.state, { tabs: [1] });
});

test("index patches merge per space and deletions stick", async () => {
  await store.patchIndex("t2", { upsert: [{ id: "a" }, { id: "b" }], activeId: "a" });
  const first = await store.readIndex("t2");
  assert.deepEqual(first.spaces.map((s) => s.id), ["a", "b"]);
  await store.patchIndex("t2", { remove: ["a"] });
  // A device that hasn't seen the deletion can't bring the space back.
  await store.patchIndex("t2", { upsert: [{ id: "a" }, { id: "c" }] });
  const index = await store.readIndex("t2");
  assert.deepEqual(index.spaces.map((s) => s.id), ["b", "c"]);
  assert.equal(index.rev, 3);
  assert.equal(await store.isDeleted("t2", "a"), true);
  // The earlier read is not mutated by later patches.
  assert.deepEqual(first.spaces.map((s) => s.id), ["a", "b"]);
});

test("snippets keep the newest edit and tombstone removals", async () => {
  await store.patchSnippets("t3", { upsert: [{ id: "s1", updatedAt: 10, name: "new" }] });
  await store.patchSnippets("t3", { upsert: [{ id: "s1", updatedAt: 5, name: "stale" }, { id: "s2", updatedAt: 1 }] });
  let lib = await store.readSnippets("t3");
  assert.equal(lib.rev, 2);
  assert.equal(lib.snippets.find((s) => s.id === "s1")?.name, "new");
  await store.patchSnippets("t3", { remove: ["s2"] });
  await store.patchSnippets("t3", { upsert: [{ id: "s2", updatedAt: 99 }] });
  lib = await store.readSnippets("t3");
  assert.deepEqual(lib.snippets.map((s) => s.id), ["s1"]);
});
