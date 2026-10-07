import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Fails when Node-only code reaches the browser bundle. Native DuckDB (`@duckdb/node-api`,
 * `src/lib/duckdb-node`), Node's `fs` and the `ws` server must stay in the CLI / server
 * side; the browser runs DuckDB-Wasm and the native WebSocket. Run after `next build`.
 */
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const chunksDir = join(root, ".next", "static", "chunks");

const MARKERS = [
  { label: "native DuckDB addon", pattern: /@duckdb\/node-api/ },
  { label: "Node DuckDB engine (src/lib/duckdb-node)", pattern: /duckdb-node/ },
  { label: "Node fs module", pattern: /["'`]node:fs(?:\/promises)?["'`]/ },
  { label: "ws server", pattern: /ws\/lib\/websocket-server|new WebSocketServer\(/ },
];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (entry.endsWith(".js")) files.push(full);
  }
  return files;
}

let chunks;
try {
  chunks = walk(chunksDir);
} catch {
  console.error(`check-browser-bundle: no browser chunks at ${relative(root, chunksDir)} — run \`next build\` first.`);
  process.exit(1);
}

const hits = [];
for (const file of chunks) {
  const source = readFileSync(file, "utf8");
  for (const { label, pattern } of MARKERS) {
    if (pattern.test(source)) hits.push(`${relative(root, file)}: ${label}`);
  }
}

if (hits.length > 0) {
  console.error("check-browser-bundle: Node-only code found in the browser bundle:");
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}
console.log(`check-browser-bundle: ${chunks.length} browser chunks clean (no native DuckDB, node:fs or ws server code).`);
