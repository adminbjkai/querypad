import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import test from "node:test";
import WebSocket from "ws";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

const SERVER = path.join(import.meta.dirname, "..", "collab", "server.mjs");

async function startServer(): Promise<{ proc: ChildProcess; port: number }> {
  const proc = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: "0", HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const port = await new Promise<number>((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("collab server did not start")), 10_000);
    proc.stdout!.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      const m = /listening on [^:]+:(\d+)/.exec(buf);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    });
    proc.once("exit", (code) => reject(new Error(`collab server exited early (${code})`)));
  });
  return { proc, port };
}

function waitFor(check: () => boolean, label: string, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (check()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error(`timed out: ${label}`));
      setTimeout(tick, 20);
    };
    tick();
  });
}

function connect(port: number, room: string) {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(`ws://127.0.0.1:${port}/collab`, room, doc, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    WebSocketPolyfill: WebSocket as any,
    disableBc: true, // force traffic through the relay, not an in-process BroadcastChannel
  });
  const close = () => {
    provider.destroy();
    doc.destroy(); // also destroys the provider-owned Awareness (and its timer)
  };
  return { doc, provider, close };
}

test("collab relay syncs Y.Text, binary map values and awareness between two peers", async (t) => {
  const { proc, port } = await startServer();
  const a = connect(port, "room-1");
  const b = connect(port, "room-1");
  t.after(async () => {
    a.close();
    b.close();
    proc.kill("SIGTERM");
    if (proc.exitCode === null) await once(proc, "exit");
  });

  await waitFor(() => a.provider.synced && b.provider.synced, "both providers synced");

  // Health endpoint
  const health = await fetch(`http://127.0.0.1:${port}/collab/health`);
  assert.equal(health.status, 200);
  assert.equal(await health.text(), "ok");

  // Text edits propagate A -> B and B -> A
  a.doc.getText("tab-query-1").insert(0, "SELECT 1");
  await waitFor(() => b.doc.getText("tab-query-1").toString() === "SELECT 1", "text A->B");
  b.doc.getText("tab-query-1").insert(8, " AS x");
  await waitFor(() => a.doc.getText("tab-query-1").toString() === "SELECT 1 AS x", "text B->A");

  // Uint8Array inside a Y.Map value survives the round trip (file sync format)
  const bytes = new Uint8Array([1, 2, 3, 250]);
  a.doc.getMap("files").set("t", { name: "t", fileName: "t.csv", data: bytes });
  await waitFor(() => b.doc.getMap("files").has("t"), "file map A->B");
  const got = b.doc.getMap("files").get("t") as { data: Uint8Array };
  assert.ok(got.data instanceof Uint8Array);
  assert.deepEqual(Array.from(got.data), [1, 2, 3, 250]);

  // Awareness propagates
  a.provider.awareness.setLocalStateField("peer", { id: "a", name: "Alice", color: "#f00" });
  await waitFor(
    () => b.provider.awareness.getStates().get(a.doc.clientID)?.peer?.name === "Alice",
    "awareness A->B"
  );

  // A late joiner receives the existing document state
  const c = connect(port, "room-1");
  t.after(c.close);
  await waitFor(() => c.provider.synced, "late joiner synced");
  assert.equal(c.doc.getText("tab-query-1").toString(), "SELECT 1 AS x");

  // Other rooms are isolated
  const d = connect(port, "room-2");
  t.after(d.close);
  await waitFor(() => d.provider.synced, "other room synced");
  assert.equal(d.doc.getText("tab-query-1").toString(), "");

  // Leaving peer's awareness is removed for the others
  a.close();
  await waitFor(() => !b.provider.awareness.getStates().has(a.doc.clientID), "awareness removal");
});

test("collab relay rejects invalid room paths and unknown routes", async (t) => {
  const { proc, port } = await startServer();
  t.after(async () => {
    proc.kill("SIGTERM");
    if (proc.exitCode === null) await once(proc, "exit");
  });

  for (const bad of ["/collab/", "/collab/bad%20room", "/collab/a/b", "/other/room", `/collab/${"x".repeat(65)}`]) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${bad}`);
    const [status] = await new Promise<[number | undefined]>((resolve) => {
      ws.on("unexpected-response", (_req, res) => resolve([res.statusCode]));
      ws.on("open", () => resolve([101]));
      ws.on("error", () => resolve([undefined]));
    });
    ws.terminate();
    assert.equal(status, 400, `expected 400 for ${bad}`);
  }

  const notFound = await fetch(`http://127.0.0.1:${port}/nope`);
  assert.equal(notFound.status, 404);
  await notFound.text();
});
