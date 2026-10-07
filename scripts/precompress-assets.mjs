// Writes gzip siblings (file.gz) for the large static assets under public/duckdb and public/monaco
// so a front proxy with `gzip_static` can serve them precompressed (the 34 MB DuckDB module
// shrinks to ~8 MB). Idempotent: skips files whose .gz is newer than the source.
import { createReadStream, createWriteStream, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";

const ROOTS = ["public/duckdb", "public/monaco"];
const EXT = /\.(wasm|js|css|json|ttf)$/;

async function compress(file) {
  const out = `${file}.gz`;
  if (existsSync(out) && statSync(out).mtimeMs >= statSync(file).mtimeMs) return false;
  await pipeline(createReadStream(file), createGzip({ level: 9 }), createWriteStream(out));
  return true;
}

async function walk(dir) {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) n += await walk(p);
    else if (EXT.test(entry.name) && statSync(p).size > 4096 && (await compress(p))) n += 1;
  }
  return n;
}

let total = 0;
for (const root of ROOTS) if (existsSync(root)) total += await walk(root);
console.log(`precompress-assets: ${total} file(s) gzipped`);
