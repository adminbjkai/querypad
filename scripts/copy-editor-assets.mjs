import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";
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

/**
 * Only what the editor requests at runtime (the app registers the `sql` language, its own
 * themes and no language services): the AMD loader, the editor entry and its static
 * dependencies, the SQL tokenizer, the editor worker and the default (English) messages.
 * Everything else in min/vs (other language tokenizers, the CSS/HTML/JSON/TS modes and
 * workers, translated messages) is ~14 MB that would never be fetched.
 */
const KEEP = [
  /^loader\.js$/,
  /^editor\//,
  /^editor\.api-/,
  /^monaco\.contribution-/, // language-service contributions `editor.main` requires statically
  /^workers-/,
  /^basic-languages\/monaco\.contribution\.js$/,
  /^sql-/,
  /^assets\/editor\.worker-/,
  /^_commonjsHelpers-/,
  /^nls\.messages-loader\.js$/,
  /^nls\.messages\.js\.js$/,
];
const KEEP_DIRS = new Set(["editor", "assets", "basic-languages"]);

// A versioned URL lets browsers cache Monaco indefinitely without risking stale assets.
rmSync(publicRoot, { recursive: true, force: true });
mkdirSync(dirname(destination), { recursive: true });
cpSync(source, destination, {
  recursive: true,
  filter: (src) => {
    const rel = relative(source, src).split(sep).join("/");
    if (rel === "") return true;
    if (statSync(src).isDirectory()) return KEEP_DIRS.has(rel);
    return KEEP.some((pattern) => pattern.test(rel));
  },
});

// Guard against a Monaco upgrade changing the layout: everything the editor loads must exist.
const required = [
  /^loader\.js$/,
  /^editor\/editor\.main\.js$/,
  /^editor\/editor\.main\.css$/,
  /^editor\.api-.*\.js$/,
  /^sql-.*\.js$/,
  /^assets\/editor\.worker-.*\.js$/,
  /^basic-languages\/monaco\.contribution\.js$/,
];
const copied = readdirSync(destination, { recursive: true }).map((entry) => String(entry).split(sep).join("/"));
const missing = required.filter((pattern) => !copied.some((entry) => pattern.test(entry)));
if (missing.length > 0) {
  throw new Error(`Monaco ${version} layout changed; missing ${missing.map(String).join(", ")} in ${source}`);
}

console.log(`Copied Monaco ${version} browser assets (${copied.length} entries) to public/monaco/${version}/vs/`);
