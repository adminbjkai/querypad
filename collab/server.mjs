// QueryPad collaboration relay: a minimal self-hosted Yjs server that speaks the
// standard y-websocket protocol (sync + awareness). Plain Node ESM, no build step.
// Runtime deps: ws, yjs, y-protocols, lib0.
//
// Env:
//   PORT                       listen port (default 1999; 0 = random)
//   HOST                       bind address (default 0.0.0.0)
//   COLLAB_MAX_ROOMS           max concurrent rooms (default 200)
//   COLLAB_MAX_PAYLOAD_BYTES   max WebSocket message size (default 32MB)
//   COLLAB_ROOM_TTL_MS         keep an empty room this long before destroying it (default 60000)
//
// Paths:
//   GET /collab/health  -> 200 "ok"
//   WS  /collab/<room>  room = [A-Za-z0-9_-]{1,64}

import http from "node:http";
import { WebSocketServer } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

const PORT = Number(process.env.PORT ?? 1999);
const HOST = process.env.HOST || "0.0.0.0";
const MAX_ROOMS = Number(process.env.COLLAB_MAX_ROOMS ?? 200);
const MAX_PAYLOAD = Number(process.env.COLLAB_MAX_PAYLOAD_BYTES ?? 32 * 1024 * 1024);
const ROOM_TTL_MS = Number(process.env.COLLAB_ROOM_TTL_MS ?? 60_000);
const PING_INTERVAL_MS = 30_000;

const messageSync = 0;
const messageAwareness = 1;

const ROOM_PATH = /^\/collab\/([A-Za-z0-9_-]{1,64})$/;

const log = (...args) => console.log(`[collab] ${new Date().toISOString()}`, ...args);

/** @type {Map<string, Room>} */
const rooms = new Map();

class Room {
  constructor(name) {
    this.name = name;
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.awareness.setLocalState(null);
    /** @type {Map<import("ws").WebSocket, Set<number>>} conn -> awareness client ids it controls */
    this.conns = new Map();
    this.destroyTimer = null;

    this.doc.on("update", (update) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      this.broadcast(encoding.toUint8Array(encoder));
    });

    this.awareness.on("update", ({ added, updated, removed }, origin) => {
      const changed = added.concat(updated, removed);
      const controlled = origin && this.conns.get(origin);
      if (controlled) {
        for (const id of added) controlled.add(id);
        for (const id of removed) controlled.delete(id);
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed)
      );
      this.broadcast(encoding.toUint8Array(encoder));
    });
  }

  broadcast(message) {
    for (const conn of this.conns.keys()) send(conn, message);
  }

  join(conn) {
    if (this.destroyTimer) {
      clearTimeout(this.destroyTimer);
      this.destroyTimer = null;
    }
    this.conns.set(conn, new Set());

    conn.on("message", (data) => {
      try {
        this.handleMessage(conn, new Uint8Array(data));
      } catch (err) {
        log(`room=${this.name} bad message:`, err?.message ?? err);
        conn.close(1003, "bad message");
      }
    });
    conn.on("close", () => this.leave(conn));

    // Sync step 1: ask the client for what we're missing; it replies with step 2
    // and sends its own step 1, which we answer in handleMessage.
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    send(conn, encoding.toUint8Array(encoder));

    const states = this.awareness.getStates();
    if (states.size > 0) {
      const aw = encoding.createEncoder();
      encoding.writeVarUint(aw, messageAwareness);
      encoding.writeVarUint8Array(
        aw,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(states.keys()))
      );
      send(conn, encoding.toUint8Array(aw));
    }
  }

  handleMessage(conn, message) {
    const decoder = decoding.createDecoder(message);
    const type = decoding.readVarUint(decoder);
    if (type === messageSync) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.readSyncMessage(decoder, encoder, this.doc, conn);
      if (encoding.length(encoder) > 1) send(conn, encoding.toUint8Array(encoder));
    } else if (type === messageAwareness) {
      awarenessProtocol.applyAwarenessUpdate(
        this.awareness,
        decoding.readVarUint8Array(decoder),
        conn
      );
    }
    // Other message types (auth, query-awareness) are ignored.
  }

  leave(conn) {
    const controlled = this.conns.get(conn);
    if (!controlled) return;
    this.conns.delete(conn);
    if (controlled.size > 0) {
      awarenessProtocol.removeAwarenessStates(this.awareness, Array.from(controlled), null);
    }
    if (this.conns.size === 0 && !this.destroyTimer) {
      this.destroyTimer = setTimeout(() => this.destroy(), ROOM_TTL_MS);
      this.destroyTimer.unref?.();
    }
  }

  destroy() {
    if (this.conns.size > 0) return;
    rooms.delete(this.name);
    this.awareness.destroy();
    this.doc.destroy();
    log(`room=${this.name} destroyed (rooms=${rooms.size})`);
  }
}

function send(conn, message) {
  if (conn.readyState !== conn.OPEN) return;
  conn.send(message, (err) => {
    if (err) conn.terminate();
  });
}

function rejectUpgrade(socket, status, text) {
  socket.write(
    `HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(text)}\r\n\r\n${text}`
  );
  socket.destroy();
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "GET" && pathname === "/collab/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });

server.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  const match = ROOM_PATH.exec(pathname);
  if (!match) {
    rejectUpgrade(socket, 400, "Bad Request");
    return;
  }
  const name = match[1];
  if (!rooms.has(name) && rooms.size >= MAX_ROOMS) {
    log(`room=${name} rejected: room limit ${MAX_ROOMS} reached`);
    rejectUpgrade(socket, 503, "Service Unavailable");
    return;
  }
  wss.handleUpgrade(req, socket, head, (conn) => {
    let room = rooms.get(name);
    if (!room) {
      room = new Room(name);
      rooms.set(name, room);
      log(`room=${name} created (rooms=${rooms.size})`);
    }
    conn.isAlive = true;
    conn.on("pong", () => {
      conn.isAlive = true;
    });
    conn.on("error", (err) => log(`room=${name} socket error:`, err.message));
    room.join(conn);
  });
});

const pingTimer = setInterval(() => {
  for (const conn of wss.clients) {
    if (!conn.isAlive) {
      conn.terminate();
      continue;
    }
    conn.isAlive = false;
    conn.ping();
  }
}, PING_INTERVAL_MS);

server.listen(PORT, HOST, () => {
  const addr = server.address();
  log(`listening on ${HOST}:${typeof addr === "object" && addr ? addr.port : PORT}`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`${signal} received, shutting down`);
  clearInterval(pingTimer);
  for (const conn of wss.clients) conn.close(1001, "server shutting down");
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
