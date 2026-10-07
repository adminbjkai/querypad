import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { addCellAfter, moveCell, newCell, removeCell, updateCell } from "../src/lib/notebook/cells";
import { snapshotKey } from "../src/lib/persistence/snapshot";
import type { PersistedState } from "../src/lib/persistence/browser";

// The fs-store reads its root once at import, so point it at a scratch directory first.
const root = mkdtempSync(path.join(tmpdir(), "qp-library-"));
process.env.QUERYPAD_DATA_DIR = root;
let fsStore: typeof import("../src/lib/server-store/fs-store");
let ws: typeof import("../src/stores/workspace-store");

test.before(async () => {
  fsStore = await import("../src/lib/server-store/fs-store");
  ws = await import("../src/stores/workspace-store");
});
test.after(() => rm(root, { recursive: true, force: true }));

const store = () => ws.useWorkspaceStore.getState();

test("deleting a folder unfiles its queries and notebooks instead of deleting them", () => {
  const folder = store().createFolder("Reports");
  const other = store().createFolder("Other");
  const tabId = store().activeTabId;
  store().updateTab(tabId, { query: "SELECT 1" });
  const query = store().saveQuery(tabId, "One", folder.id);
  const notebook = store().createNotebook("Weekly", folder.id);
  const kept = store().createNotebook("Elsewhere", other.id);
  assert.equal(notebook.cells.length, 1, "a new notebook starts with one cell");
  assert.equal(notebook.cells[0].kind, "sql");

  store().deleteFolder(folder.id);
  assert.deepEqual(store().folders.map((f) => f.id), [other.id]);
  assert.equal(store().savedQueries.find((q) => q.id === query.id)?.folderId, null);
  assert.equal(store().notebooks.find((n) => n.id === notebook.id)?.folderId, null);
  assert.equal(store().notebooks.find((n) => n.id === kept.id)?.folderId, other.id);
});

test("saveQuery creates a saved query bound to the tab, then updates it in place", () => {
  assert.ok(store().addTab("SELECT 'a'"));
  const tabId = store().activeTabId;
  const created = store().saveQuery(tabId, "Letters");
  const tab = () => store().tabs.find((t) => t.id === tabId)!;
  assert.equal(tab().savedQueryId, created.id);
  assert.equal(tab().title, "Letters");
  assert.equal(created.sql, "SELECT 'a'");
  assert.equal(created.folderId, null);

  // Unchanged text: idempotent, no new record and no bump.
  const before = store().savedQueries;
  const same = store().saveQuery(tabId, "Letters");
  assert.equal(same.id, created.id);
  assert.equal(same.updatedAt, created.updatedAt);
  assert.equal(store().savedQueries, before, "no store change when nothing differs");

  store().updateTab(tabId, { query: "SELECT 'b'" });
  const updated = store().saveQuery(tabId, "Letters v2");
  assert.equal(updated.id, created.id);
  assert.equal(updated.sql, "SELECT 'b'");
  assert.equal(updated.name, "Letters v2");
  assert.ok(updated.updatedAt >= created.updatedAt);
  assert.equal(store().savedQueries.filter((q) => q.id === created.id).length, 1);
  assert.equal(tab().title, "Letters v2");

  const folder = store().createFolder("Moved");
  store().moveSavedQuery(created.id, folder.id);
  assert.equal(store().savedQueries.find((q) => q.id === created.id)?.folderId, folder.id);
  store().renameSavedQuery(created.id, "Renamed");
  assert.equal(tab().title, "Renamed");
});

test("openSavedQuery reuses the bound tab and otherwise opens a seeded tab", () => {
  assert.ok(store().addTab("SELECT 42"));
  const tabId = store().activeTabId;
  const saved = store().saveQuery(tabId, "Answer");
  store().addTab();
  assert.notEqual(store().activeTabId, tabId);
  const count = store().tabs.length;

  assert.equal(store().openSavedQuery(saved.id), tabId);
  assert.equal(store().activeTabId, tabId);
  assert.equal(store().tabs.length, count, "no second tab for the same query");

  store().removeTab(tabId);
  const opened = store().openSavedQuery(saved.id);
  const tab = store().tabs.find((t) => t.id === opened)!;
  assert.equal(tab.query, "SELECT 42");
  assert.equal(tab.title, "Answer");
  assert.equal(tab.savedQueryId, saved.id);
  assert.equal(store().activeTabId, opened);
});

test("deleteSavedQuery unlinks bound tabs but keeps their text", () => {
  assert.ok(store().addTab("SELECT 'keep me'"));
  const tabId = store().activeTabId;
  const saved = store().saveQuery(tabId, "Doomed");
  store().deleteSavedQuery(saved.id);
  const tab = store().tabs.find((t) => t.id === tabId)!;
  assert.equal(tab.savedQueryId, null);
  assert.equal(tab.query, "SELECT 'keep me'");
  assert.equal(store().savedQueries.some((q) => q.id === saved.id), false);
});

test("notebook cell helpers add, remove, move and update without ever emptying the list", () => {
  const a = newCell("sql", "SELECT 1");
  const b = newCell("markdown", "# Note");
  const c = newCell("sql");
  assert.equal(c.source, "");

  let cells = addCellAfter([], null, a);
  cells = addCellAfter(cells, a.id, b);
  cells = addCellAfter(cells, null, c);
  assert.deepEqual(cells.map((x) => x.id), [c.id, a.id, b.id]);

  cells = moveCell(cells, c.id, 1);
  assert.deepEqual(cells.map((x) => x.id), [a.id, c.id, b.id]);
  assert.equal(moveCell(cells, a.id, -1), cells, "moving past the start is a no-op");
  assert.equal(moveCell(cells, b.id, 1), cells, "moving past the end is a no-op");

  cells = updateCell(cells, c.id, { source: "SELECT 2", kind: "markdown" });
  assert.deepEqual(cells.find((x) => x.id === c.id), { id: c.id, kind: "markdown", source: "SELECT 2" });

  cells = removeCell(cells, c.id);
  assert.deepEqual(cells.map((x) => x.id), [a.id, b.id]);
  cells = removeCell(removeCell(cells, a.id), b.id);
  assert.equal(cells.length, 1, "never zero cells");
  assert.equal(cells[0].kind, "sql");
  assert.equal(cells[0].source, "");

  const notebook = store().createNotebook("Cells");
  store().updateNotebookCells(notebook.id, cells);
  assert.deepEqual(store().notebooks.find((n) => n.id === notebook.id)?.cells, cells);
  store().renameNotebook(notebook.id, "Renamed");
  const folder = store().createFolder("NB");
  store().moveNotebook(notebook.id, folder.id);
  const nb = store().notebooks.find((n) => n.id === notebook.id)!;
  assert.equal(nb.name, "Renamed");
  assert.equal(nb.folderId, folder.id);
  store().deleteNotebook(notebook.id);
  assert.equal(store().notebooks.some((n) => n.id === notebook.id), false);
});

test("the library and tab bindings round-trip through the server store", async () => {
  const snapshot = ws.snapshotState();
  assert.ok(snapshot.folders!.length > 0 && snapshot.savedQueries!.length > 0 && snapshot.notebooks!.length > 0);
  assert.ok(snapshot.tabs!.some((t) => t.savedQueryId), "a bound tab is saved with its query id");
  await fsStore.writeSpaceState("lib", "s1", snapshot as unknown as Record<string, unknown>);
  const reloaded = (await fsStore.readSpace("lib", "s1"))?.state as PersistedState;
  assert.deepEqual(reloaded, JSON.parse(JSON.stringify(snapshot)));
  assert.equal(snapshotKey(reloaded), snapshotKey(snapshot));
  // An older record without the library still loads (as empty arrays, see openSpace).
  await fsStore.writeSpaceState("lib", "old", { tabs: [] });
  const old = (await fsStore.readSpace("lib", "old"))?.state as PersistedState;
  assert.equal(old.folders, undefined);
});
