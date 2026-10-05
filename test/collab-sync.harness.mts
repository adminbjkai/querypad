// Harness for test/collab-sync.test.ts (run in a child process because node:test
// module mocks need --experimental-test-module-mocks). Exercises the real
// src/lib/collaboration/sync.ts + file-sync.ts against the real relay, with the
// workspace store and DuckDB loader mocked, and a raw y-websocket peer on the other side.
import { mock } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { create } from "zustand";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { EditorTab, QueryResult, TableInfo } from "../src/types";

interface FileEntry {
  name: string;
  fileName: string;
  data: Uint8Array;
}
interface MockWorkspace {
  tabs: EditorTab[];
  activeTabId: string;
  tables: TableInfo[];
  fileEntries: FileEntry[];
  addTable: (table: TableInfo, fileName: string, data: Uint8Array) => void;
}
interface TabMeta {
  id: string;
  title: string;
  createdAt: number;
}

const src = new URL("../src/", import.meta.url);
const RESULT = { rows: [[1]] } as unknown as QueryResult;
const mkTab = (id: string, query: string, result: QueryResult | null = null): EditorTab => ({
  id,
  title: `T-${id}`,
  query,
  result,
  error: null,
  isExecuting: false,
  createdAt: 1,
});
const table = (name: string): TableInfo => ({ name, columns: [], rowCount: 0 }) as unknown as TableInfo;

const ws = create<MockWorkspace>((set) => ({
  tabs: [mkTab("a", "SELECT a", RESULT), mkTab("b", "SELECT b")],
  activeTabId: "b",
  tables: [],
  fileEntries: [{ name: "f1", fileName: "f1.csv", data: new Uint8Array([1, 2, 3]) }],
  addTable: (t, fileName, data) =>
    set((s) => ({ tables: [...s.tables, t], fileEntries: [...s.fileEntries, { name: t.name, fileName, data }] })),
}));
const updateTabs = (fn: (tabs: EditorTab[]) => EditorTab[]) => ws.setState((s) => ({ tabs: fn(s.tabs) }));

const loaded: string[] = [];
mock.module(new URL("stores/workspace-store.ts", src).href, { namedExports: { useWorkspaceStore: ws } });
mock.module(new URL("lib/duckdb/files.ts", src).href, {
  namedExports: {
    loadBufferAsTable: async (name: string) => {
      loaded.push(name);
      return table(name);
    },
  },
});

const { connectToRoom, disconnectFromRoom } = await import("../src/lib/collaboration/sync");
const { useCollaborationStore } = await import("../src/stores/collaboration-store");

const proc = spawn(process.execPath, [new URL("../collab/server.mjs", import.meta.url).pathname], {
  env: { ...process.env, PORT: "0", HOST: "127.0.0.1" },
  stdio: ["ignore", "pipe", "inherit"],
});
const port = await new Promise<number>((resolve) =>
  proc.stdout!.on("data", (chunk) => {
    const m = /listening on [^:]+:(\d+)/.exec(String(chunk));
    if (m) resolve(Number(m[1]));
  })
);

async function until(check: () => boolean, label: string) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > 4000) throw new Error(`timed out: ${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

let failed = false;
try {
  await connectToRoom("room", `127.0.0.1:${port}`); // bare host:port form is normalized
  assert.equal(useCollaborationStore.getState().connected, true);

  const doc = new Y.Doc();
  const peer = new WebsocketProvider(`ws://127.0.0.1:${port}/collab`, "room", doc, { disableBc: true });
  const yTabs = doc.getArray<TabMeta>("tabs");
  const yFiles = doc.getMap<FileEntry>("files");
  await until(() => peer.synced && yTabs.length === 2, "peer sees tabs");
  assert.deepEqual(yTabs.toArray(), [
    { id: "a", title: "T-a", createdAt: 1 },
    { id: "b", title: "T-b", createdAt: 1 },
  ]);
  assert.equal(doc.getText("tab-query-a").toString(), "SELECT a");
  await until(() => yFiles.has("f1"), "existing file published on connect");
  assert.ok(yFiles.get("f1")!.data instanceof Uint8Array);

  // Local keystroke: tabs array untouched, text diff pushed to the tab's Y.Text
  let tabsEvents = 0;
  yTabs.observe(() => tabsEvents++);
  updateTabs((tabs) => tabs.map((t) => (t.id === "b" ? { ...t, query: "SELECT b1" } : t)));
  await until(() => doc.getText("tab-query-b").toString() === "SELECT b1", "local text -> peer");
  assert.equal(tabsEvents, 0, "tabs array untouched by keystroke");

  // Remote edit to a non-active tab updates the store, keeping result + activeTabId
  doc.getText("tab-query-a").insert(8, " -- hi");
  await until(() => ws.getState().tabs[0].query === "SELECT a -- hi", "remote text -> store");
  assert.deepEqual(ws.getState().tabs[0].result, RESULT);
  assert.equal(ws.getState().activeTabId, "b");

  // Remote new tab gets its query from Y.Text; existing results and active tab preserved
  doc.transact(() => {
    yTabs.push([{ id: "c", title: "T-c", createdAt: 2 }]);
    doc.getText("tab-query-c").insert(0, "SELECT c");
  });
  await until(() => ws.getState().tabs.length === 3, "remote tab -> store");
  assert.equal(ws.getState().tabs[2].query, "SELECT c");
  assert.deepEqual(ws.getState().tabs[0].result, RESULT);
  assert.equal(ws.getState().activeTabId, "b");
  doc.getText("tab-query-c").insert(8, "!");
  await until(() => ws.getState().tabs[2].query === "SELECT c!", "observer on new remote tab");

  // Local tab close + rename propagate
  updateTabs((tabs) =>
    tabs.filter((t) => t.id !== "a").map((t) => (t.id === "b" ? { ...t, title: "Renamed" } : t))
  );
  await until(
    () => JSON.stringify(yTabs.toArray().map((m) => m.title)) === '["Renamed","T-c"]',
    "close+rename -> peer"
  );

  // Remote file is loaded locally; new local file is published automatically
  yFiles.set("f2", { name: "f2", fileName: "f2.csv", data: new Uint8Array([9]) });
  await until(() => ws.getState().fileEntries.some((f) => f.name === "f2"), "remote file loaded");
  assert.deepEqual(loaded, ["f2"]);
  ws.getState().addTable(table("f3"), "f3.csv", new Uint8Array([7, 7]));
  await until(() => yFiles.has("f3"), "local file -> peer");

  // After disconnect nothing is published any more
  disconnectFromRoom();
  assert.equal(useCollaborationStore.getState().ydoc, null);
  ws.getState().addTable(table("f4"), "f4.csv", new Uint8Array([4]));
  updateTabs((tabs) => tabs.map((t) => ({ ...t, query: "after" })));
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(!yFiles.has("f4"), "no file publish after disconnect");
  assert.notEqual(doc.getText("tab-query-b").toString(), "after");

  console.log("ALL SYNC CHECKS PASSED");
  peer.destroy();
  doc.destroy();
} catch (err) {
  failed = true;
  console.error(err);
} finally {
  proc.kill("SIGTERM");
}
process.exit(failed ? 1 : 0);
