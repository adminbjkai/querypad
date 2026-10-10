import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// The store resolves its root on first use, so point it at a scratch directory first.
const root = mkdtempSync(path.join(tmpdir(), "qp-http-cache-"));
process.env.QUERYPAD_DATA_DIR = root;
let store: typeof import("../src/lib/server-store/fs-store");
let fileRoute: typeof import("../src/app/api/store/spaces/[id]/files/[name]/route");
let indexRoute: typeof import("../src/app/api/store/route");

test.before(async () => {
  store = await import("../src/lib/server-store/fs-store");
  fileRoute = await import("../src/app/api/store/spaces/[id]/files/[name]/route");
  indexRoute = await import("../src/app/api/store/route");
});
test.after(() => rm(root, { recursive: true, force: true }));

const bytes = (text: string) => new Blob([text]).stream();
const get = (url: string, ns: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, { headers: { cookie: `querypad_ns=${ns}`, ...headers } });
const getFile = (ns: string, headers?: Record<string, string>) =>
  fileRoute.GET(get("/api/store/spaces/s1/files/t", ns, headers), { params: Promise.resolve({ id: "s1", name: "t" }) });

test("table files carry an ETag and answer a matching If-None-Match with an empty 304", async () => {
  const { version } = await store.writeSpaceFile("c1", "s1", "t", bytes("one"));
  const first = await getFile("c1");
  assert.equal(first.status, 200);
  assert.equal(await first.text(), "one");
  const tag = first.headers.get("etag")!;
  assert.equal(tag, `"c1:${version}"`, "the tag is the version the space record lists");
  assert.equal(first.headers.get("cache-control"), "private, no-cache");
  assert.equal(first.headers.get("vary"), "Cookie");

  for (const ifNoneMatch of [tag, `W/${tag}`, `"other", ${tag}`]) {
    const again = await getFile("c1", { "if-none-match": ifNoneMatch });
    assert.equal(again.status, 304, ifNoneMatch);
    assert.equal(again.body, null);
    assert.equal(again.headers.get("etag"), tag);
  }

  // New bytes, new tag: the old one no longer matches.
  await store.writeSpaceFile("c1", "s1", "t", bytes("two!"));
  const changed = await getFile("c1", { "if-none-match": tag });
  assert.equal(changed.status, 200);
  assert.equal(await changed.text(), "two!");
  assert.notEqual(changed.headers.get("etag"), tag);
});

test("a file's tag never matches across namespaces", async () => {
  await store.writeSpaceFile("c2", "s1", "t", bytes("ns two"));
  const own = await getFile("c2");
  const tag = own.headers.get("etag")!;
  await own.body?.cancel();
  await store.writeSpaceFile("c3", "s1", "t", bytes("ns 3"));
  const other = await getFile("c3", { "if-none-match": tag });
  assert.equal(other.status, 200);
  assert.equal(await other.text(), "ns 3");
  assert.equal((await getFile("missing", { "if-none-match": "*" })).status, 404);
});

test("the live-sync poll is tagged by its content and 304s while nothing changed", async () => {
  await store.patchIndex("c4", { activeId: "a", upsert: [{ id: "a" }] });
  const first = await indexRoute.GET(get("/api/store", "c4"));
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.equal(body.index.rev, 1);
  assert.equal(first.headers.get("content-type"), "application/json");
  assert.equal(first.headers.get("vary"), "Cookie");
  const tag = first.headers.get("etag")!;
  assert.match(tag, /^"c4:/);

  const same = await indexRoute.GET(get("/api/store", "c4", { "if-none-match": tag }));
  assert.equal(same.status, 304);
  assert.equal(same.body, null);

  // Any rev the poll reports (index, a space, the snippets) changes the tag.
  for (const write of [
    () => store.writeSpaceState("c4", "a", {}),
    () => store.patchSnippets("c4", { upsert: [{ id: "x", updatedAt: 1 }] }),
    () => store.patchIndex("c4", { activeId: "a" }),
  ]) {
    const before = (await indexRoute.GET(get("/api/store", "c4"))).headers.get("etag")!;
    await write();
    const after = await indexRoute.GET(get("/api/store", "c4", { "if-none-match": before }));
    assert.equal(after.status, 200);
    assert.notEqual(after.headers.get("etag"), before);
  }
});
