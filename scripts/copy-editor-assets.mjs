import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const monacoPackagePath = require.resolve("monaco-editor/package.json", { paths: [root] });
const { version } = require(monacoPackagePath);
const source = join(dirname(monacoPackagePath), "min", "vs");
const publicRoot = join(root, "public", "monaco");
const destination = join(publicRoot, version, "vs");

if (!existsSync(join(source, "loader.js")) || !existsSync(join(source, "editor", "editor.main.js"))) {
  throw new Error(`Monaco ${version} AMD browser assets were not found at ${source}`);
}

// A versioned URL lets browsers cache Monaco indefinitely without risking stale assets.
rmSync(publicRoot, { recursive: true, force: true });
mkdirSync(dirname(destination), { recursive: true });
cpSync(source, destination, { recursive: true });

console.log(`Copied Monaco ${version} browser assets to public/monaco/${version}/vs/`);
