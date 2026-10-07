<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Product direction

QueryPad is pivoting from "AI-powered SQL editor" to **Cursor for Data** — a
local-first AI workspace that understands datasets (discovers relationships, builds
semantic models) before generating SQL. See `ROADMAP.md` for the layered plan.

## Two surfaces, one core

- **Web app** (`src/app`, `src/components`) runs DuckDB-Wasm in the browser.
- **CLI** (`src/cli`, `src/lib/duckdb-node`) runs native `@duckdb/node-api` in Node.
- **Shared, engine-agnostic core** (`src/lib/discovery`, `src/lib/duckdb/sql-utils.ts`)
  is consumed by both via a `QueryRunner` abstraction.
- Node-only code (`src/lib/duckdb-node`, `src/cli`) must never be imported by app code,
  or the native addon leaks into the browser bundle. `npm run check` ends with
  `check:bundle` (`scripts/check-browser-bundle.mjs`), which scans the built browser chunks
  in `.next/static/chunks` for `@duckdb/node-api`, `duckdb-node`, `node:fs` and ws server code
  and fails if any appear.
- Shared core (`src/lib/discovery`, `src/lib/ai`, `src/lib/duckdb/sql-utils.ts`) uses relative
  imports only: the CLI and the unit tests (`node --import tsx --test test/*.test.ts`) run it
  outside Next, and it must stay portable without the `@/` alias.
- **Local AI bridge** (`local-ai/bridge.mjs`, `sandbox.mjs`) runs on the host (systemd user
  unit), not in Docker: plain Node, no deps, Unix socket + token. Every CLI runs under
  bubblewrap with tools disabled — keep it that way when adding a model (re-test that the CLI
  can't read host files). The app reaches it only from `src/lib/ai/local-bridge.ts` (server).
- **Collaboration relay** (`collab/server.mjs`) is plain Node ESM with only ws, yjs,
  y-protocols and lib0 (plus lib0's dependency isomorphic.js); the Docker image copies
  just those modules for it — update the Dockerfile if the relay gains an import.

## Workspace data model

- **Spaces** (`src/lib/persistence/index.ts`): saved on the server via `/api/store`
  (`src/lib/server-store/fs-store.ts`, data dir `QUERYPAD_DATA_DIR`, default `.querypad-data`)
  so every device shares them; falls back to IndexedDB (`browser.ts`) when the API is absent.
  Records carry revs; `pullRemoteChanges` in the workspace store polls and applies other
  devices' edits (never over pending local saves). The `querypad_ns` cookie selects a storage
  namespace — e2e tests use it (`e2e/fixtures.ts`) to stay isolated. Store writes always target
  the space that was active when the change happened; switching flushes the debounced save first.
- **Snippets** (`src/stores/snippet-store.ts`): one library shared by all spaces, stored in
  `snippets.json` via `PATCH /api/store/snippets` (per-snippet upsert by `updatedAt`, tombstoned
  removals) or the `querypad-snippets` IndexedDB key; refreshed when the poll reports a new rev.
- **Assistant** (`src/stores/assistant-store.ts`, `src/lib/ai/assistant-context.ts`): answer-only chat; context is
  rebuilt from the stores on every message; `sql-run` blocks auto-run only when
  `autoRunRejection` allows (one plain query over loaded tables — no writes, settings, files
  or URLs). It never changes the workspace. Each space keeps several chats in localStorage.
- **Agent** (`src/stores/agent-store.ts`, `src/lib/agent/{plan,run}.ts`, `src/lib/ai/agent-prompt.ts`): the
  only AI surface that writes. The model answers with a plan; every step is classified
  (read / write / danger) and runs only through `runStep` — `executeQuery`, then `syncCatalog`
  with the statement's targets — behind the approval gate (reads run, writes wait unless
  approvals are Auto, danger steps always confirm, Plan mode never runs). Keep writes on that path
  so agent-made tables are persisted like the user's own; the Assistant stays answer-only.
- **Library** (`folders`, `savedQueries`, `notebooks` in the workspace store, types in
  `src/types/library.ts`): saved in the space's state record with everything else, so it syncs
  across devices through `/api/store`; it is never shared through collaboration rooms (rooms sync
  tabs and files only). Notebook cell results are session-only.
- **Catalog sync**: after any non-read-only statement, `syncCatalog` reconciles the store with
  `duckdb_tables()`/`duckdb_views()` (main schema only); new/changed tables are snapshotted to
  Parquet file entries. `mutationTargets` (`src/lib/duckdb/catalog-sql.ts`) names the tables a
  statement touched and one `readCatalogSignatures` pass (`catalog.ts`) skips untouched tables
  whose columns and estimated rows are unchanged; when a write can't be attributed (MERGE,
  EXECUTE, CALL …) it returns `null` and every table is checked exactly. The `querypad` schema
  (relationships/keys) is internal and never listed.
- **AI**: the web assistant uses `WORKSPACE_SQL_SYSTEM_PROMPT` + `buildWorkspaceContext`
  (`src/lib/ai/workspace-context.ts`) and checks answers with `checkSql`
  (`src/lib/duckdb/validate.ts`). The CLI keeps its own prompt in `generate-sql.ts`.

## UI conventions

- Colors come from semantic tokens in `src/app/globals.css` (light + `[data-theme="dark"]`);
  never hardcode palette colors in components. Column kinds use `text-k-num/k-text/k-date/
  k-bool`, joins use `text-join`.
- Shared building blocks live in `src/components/ui` (`btn`, `input`, `Dialog`, `Menu`,
  `KindGlyph`, `SectionLabel`, `Icon`). Toasts: `toast()` from `src/stores/ui-store.ts`.
- Cross-component actions (run, share, preview, open a table page) live in
  `src/lib/workspace-actions.ts`; the editor is reachable through `src/lib/editor-bridge.ts`.
- Shell: `NavRail` (left, labeled, collapsible) → side panel (`Sidebar`, workbench only) →
  `PageHeader` + page (`Home`, the workbench or a `TablePage`) → Assistant. Nav pages use
  `aria-current`, panel toggles `aria-pressed`; e2e selects them as buttons by name.

## Release and verification

- Keep `package.json`, `package-lock.json`, and the latest `CHANGELOG.md` release version in sync.
- Run `npm run check` after code/config changes (version check → lint and typecheck in parallel
  via `scripts/run-parallel.mjs` → `next build` → browser-bundle guard).
- Run `npm test` when UI behavior or e2e-covered flows change (it starts its own dev
  server on port 3217 and a relay on 1999 — it never reuses another server). `e2e/fixtures.ts`
  scopes the `querypad_ns` cookie to the configured `baseURL`; never run the e2e suite against a
  deployed host without that isolation, or the tests write into its real `default` namespace.
- Run `npm run test:cli` when discovery/CLI logic changes.
- Do not commit demo video artifacts or `.querypad/` inspection output; use the videos
  as release/README upload assets.
