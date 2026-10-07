import { copyFileSync, mkdirSync, existsSync, readFileSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const pkg = join(root, "node_modules", "@duckdb", "duckdb-wasm");
const { version } = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
const src = join(pkg, "dist");
// Versioned path (src/lib/duckdb/instance.ts builds it from PACKAGE_VERSION), so the
// immutable cache header in next.config.ts can never serve a stale module after an upgrade.
const publicRoot = join(root, "public", "duckdb");
const dest = join(publicRoot, version);

rmSync(publicRoot, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

const files = ["duckdb-eh.wasm"];
for (const f of files) {
  const srcPath = join(src, f);
  if (existsSync(srcPath)) {
    copyFileSync(srcPath, join(dest, f));
    console.log(`Copied ${f} → public/duckdb/${version}/`);
  } else {
    console.warn(`Warning: ${srcPath} not found`);
  }
}
