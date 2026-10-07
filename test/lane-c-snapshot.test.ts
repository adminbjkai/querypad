import { test } from "node:test";
import assert from "node:assert/strict";
import { INDEX_TOUCH_MS, indexEntryStale, snapshotKey } from "../src/lib/persistence/snapshot";
import type { PersistedState, SpaceMeta } from "../src/lib/persistence/browser";

const state = (): PersistedState => ({
  files: [{ name: "orders", fileName: "orders.csv" }],
  views: [],
  tabs: [{ id: "t1", title: "Query 1", query: "SELECT 1", createdAt: 1, aiThread: [] }],
  activeTabId: "t1",
  history: [],
  pipelines: [],
  activePipelineId: null,
  viewMode: "sql",
  pluginUrls: [],
  relationshipVerdicts: {},
  relationshipOverrides: [],
  folders: [],
  savedQueries: [],
  notebooks: [{ id: "n1", name: "Notes", folderId: null, cells: [{ id: "c1", kind: "sql", source: "SELECT 1" }], createdAt: 1, updatedAt: 1 }],
});

test("snapshotKey is stable for equal states and changes with any persisted field", () => {
  assert.equal(snapshotKey(state()), snapshotKey(state()));
  const typed = state();
  typed.tabs![0].query = "SELECT 2";
  assert.notEqual(snapshotKey(state()), snapshotKey(typed));
  const verdict = state();
  verdict.relationshipVerdicts = { "a.b->c.d": "accepted" };
  assert.notEqual(snapshotKey(state()), snapshotKey(verdict));
  const cell = state();
  cell.notebooks![0].cells[0].source = "SELECT 2";
  assert.notEqual(snapshotKey(state()), snapshotKey(cell), "a notebook cell edit is a new record");
  const bound = state();
  bound.tabs![0].savedQueryId = "q1";
  assert.notEqual(snapshotKey(state()), snapshotKey(bound), "binding a tab to a saved query is a new record");
});

test("indexEntryStale only asks for a space-list save when the entry would differ", () => {
  const now = 1_000_000;
  const meta: SpaceMeta = { id: "s", name: "Sales", createdAt: 0, updatedAt: now - 1000, tableCount: 2 };
  assert.equal(indexEntryStale(meta, 2, now), false, "same table count, touched a second ago");
  assert.equal(indexEntryStale(meta, 3, now), true, "table count moved");
  assert.equal(indexEntryStale(meta, 2, now + INDEX_TOUCH_MS), true, "updated time fell behind");
  assert.equal(indexEntryStale(undefined, 0, now), true, "unknown space");
});
