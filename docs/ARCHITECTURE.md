# QueryPad architecture

QueryPad has two execution surfaces and one dataset-understanding core. The browser
runs DuckDB-Wasm; the CLI runs native DuckDB. Keep runtime-specific imports at the edges.

## Runtime boundaries

| Layer | Location | Responsibility |
| --- | --- | --- |
| Web shell | `src/components/workspace`, `src/components/home` | Navigation rail (groups, New ▾, `g`-chords in `Workspace.tsx`), page header, Home, Tables and table pages, spaces, status, command palette; `DatasetList` is shared by Home and the Tables page |
| Analysis UI | `src/components/editor`, `results`, `sidebar`, `pipeline`, `assistant` | Interactive workflows over store state; `src/lib/results` holds the pure result helpers (source tables, next steps) |
| Agent | `src/components/agent`, `src/lib/agent/{plan,run}.ts`, `src/lib/ai/agent-prompt.ts` | The planning, write-capable Agent page: plan protocol, step classification, execution behind the approval gate |
| Notebooks and library | `src/components/notebook`, `src/components/library`, `src/lib/notebook`, `src/types/library.ts` | SQL/Markdown cells and their pure list helpers; folders, saved queries, the Save query dialog |
| Shared UI | `src/components/ui`, `src/lib/hooks`, `src/lib/editor/monaco-setup.ts` | Semantic controls, dialogs, menus, focus lifecycle; one Monaco loader/completion setup for every editor host |
| Workspace actions | `src/lib/workspace-actions.ts` | Cross-component run, preview, snippet, save-query, share, context actions |
| Browser engine | `src/lib/duckdb` | Wasm lifecycle, query execution, catalog reconciliation |
| Understanding core | `src/lib/discovery` | Profiles, relationship signals, explanations, semantic models |
| Native engine and CLI | `src/lib/duckdb-node`, `src/cli` | Local folder loading and command execution; never imported by app code |
| AI | `src/lib/ai` | Provider streaming, context construction, SQL checks, bridge access |
| Persistence | `src/lib/persistence`, `src/lib/server-store` | Server records and revision tracking, IndexedDB fallback |
| Collaboration | `src/lib/collaboration`, `collab/server.mjs` | Yjs documents and a separately hosted relay |

Shared discovery, AI and `sql-utils` code uses relative imports: the CLI and the unit tests
(`node --import tsx --test`) run it outside Next, so it must not depend on the `@/` alias.
Discovery consumes a `QueryRunner`, not either DuckDB implementation. The browser
Home derives its entities with `buildSemanticModel`, filters rejected joins, and reads
existing profiles; it does not maintain a second catalog or launch its own profiling loop.

## State ownership

- `workspace-store`: spaces, tables/views, profiles, relationship verdicts, SQL tabs,
  results, query history, pipelines, plugins and the query library (`folders`, `savedQueries`,
  `notebooks`). A tab bound to a saved query carries `savedQueryId`; `saveQuery` updates the
  bound record or creates one (⌘S asks for a name and folder only the first time), `openSavedQuery`
  reuses the bound tab, and deleting a folder moves its items to the top level. Library records are
  saved with the space; live rooms share tabs and files only (`src/lib/collaboration/sync.ts`),
  never the library. DuckDB's main catalog is authoritative:
  after a write, `syncCatalog` reads the catalog plus one column/row-estimate signature per
  relation (`readCatalogSignatures`) and only describes and re-snapshots tables that the
  statement named (`mutationTargets`) or whose signature moved. A write it cannot attribute
  (MERGE, EXECUTE, CALL …) makes `mutationTargets` return `null`, and every table is checked
  exactly.
- `ui-store`: theme, current page (`WorkspacePage`: Home, workbench, a table page with its selected
  dataset and tab, Tables, Agent, Notebooks with `notebookId`, Folders with `folderId`; `openNotebook`
  / `openFolder` set the page and the id, null meaning the list), the open side panel, navigation
  collapse, dialogs, sizes, cursor, toasts and per-space dismissal of the sample-data banner. The
  page is session UI state; it never changes a remote device's saved space. An empty space shows
  Home; data arriving opens the workbench; switching spaces leaves a table page and drops an open
  notebook or folder back to its list. The side panel renders only on `PANEL_PAGES` (workbench,
  notebooks); `toggleSidePanel` (⌘B) opens the workbench with it from anywhere else. The Explorer's
  quick profile view closes whenever the page or the side panel changes. Notebooks and folders are
  created from the rail's New ▾ menu, the page header and the palette through `startNotebook` /
  `startFolder` (`NavRail.tsx`), which name the record and open its page.
- `ai-store`: current model, effort and available providers. The status bar subscribes
  directly, avoiding a second cached model label or periodic UI polling.
- `assistant-store`: answer-only chats, streaming and tool execution. Each space keeps up to
  30 chats in localStorage (`querypad:assistant:v2:<space>`); answers always land in the chat
  they started in. It follows the open space itself, so Home can send before the panel opens.
  The SQL-writing assistant stores its thread with the query tab instead.
- `agent-store`: the Agent page's planning, write-capable sessions (up to 30 per space in
  `querypad:agent:v1:<space>`). The model answers with prose plus one JSON plan
  (`src/lib/ai/agent-prompt.ts`, parsed and classified by `src/lib/agent/plan.ts`); the store
  runs the steps in order through `src/lib/agent/run.ts` — `executeQuery`, then the workspace
  store's `syncCatalog` with `mutationTargets`, and a History entry tagged `source: "agent"` —
  so tables the agent creates appear everywhere the user's own SQL would. Reads run on their
  own; writes wait for approval unless the session's approvals are "auto"; danger steps (DROP,
  TRUNCATE, DELETE/UPDATE without WHERE — judged by the write itself when a CTE wraps it —
  ALTER … DROP, CREATE OR REPLACE TABLE, or a step holding several statements) always need the
  per-step click plus a confirmation; plan-only sessions never run anything. A failed step can
  be sent back for a revised plan, which resumes on its own once; after that the user decides.
  When every step is done, a catalog diff (tables added/removed, row deltas, views) feeds the
  closing summary and its follow-up suggestions. The Assistant panel is unchanged and stays
  answer-only; the Agent is the only AI surface that writes, and only through that gate.
- Notebook cells: `NotebookView` keeps a local copy of the open notebook's cells and writes it
  to the store (`updateNotebookCells`) after a 300 ms typing pause; structural edits (add, move,
  convert, delete) are written at once, and running a cell, leaving the notebook or the space's
  data being swapped out (`onBeforeSpaceData` in the workspace store, run by `flushWorkspaceSave`)
  flushes whatever is pending. A store change the view did not push (another device) replaces the local
  copy unless an edit is still pending. Cell results live in a module-level map for the session
  only — they survive leaving and reopening the notebook, never a reload. `runCellSql` mirrors
  `runQuery`: `executeQuery`, then `syncCatalog` for anything that is not read-only.
- Results view state: `ResultsPanel` keeps one view record per tab (view, filter, chart, inspected
  column, grid sort, hidden columns, open column card). The sort is controlled from the panel so
  the toolbar can show and clear it; `hidden` (from "Choose columns") produces a `visibleResult`
  (columns, types and projected rows) that the grid, the inspector and the export menu all use,
  while the tab's stored result stays complete. Next steps are computed locally (`src/lib/results/next-steps.ts`) from the SQL's source
  tables and the discovered relationships — no model call.
- `snippet-store`: a shared cross-space snippet library, with timestamp merges and deletion
  tombstones.

Cross-component actions use the editor bridge for selection/insertion. An action that
opens SQL must reveal the workbench as well as selecting SQL mode. Components should
subscribe to the store fields they use rather than the entire store.

## Persistence and safety

`/api/store` writes to `QUERYPAD_DATA_DIR` (default `.querypad-data`). When the API is absent,
spaces use IndexedDB. Revisions let clients pull changes without overwriting pending
local writes. Debounced saves capture their target space; switching flushes pending work.
The `querypad_ns` cookie isolates server workspaces during tests. Clients poll every 3 s while
someone is using the page and every 15 s once it has seen no activity for 60 s; the server
parses each polled record (index, space revs, snippets) once per file version (inode, size,
mtime). The poll response and every table file carry an `ETag` (`Cache-Control: private,
no-cache`, `Vary: Cookie`, scoped to the namespace) and answer a matching `If-None-Match` with
304; the client fetches them with `cache: "no-cache"`, so an unchanged poll or a reopened space
revalidates instead of downloading every table again.

State saves are debounced 400 ms (1200 ms while typing in the editor) and compared against
the last written snapshot (`src/lib/persistence/snapshot.ts`): an unchanged record is not
sent. Spaces saved before the library existed load with empty `folders`, `savedQueries` and
`notebooks`. Agent sessions (`querypad:agent:v1:<space>`) and Assistant chats stay in
localStorage, up to 30 each per space; and the space index is only patched when the table count changed or the entry's
`updatedAt` lags by 60 s or more. Hiding the page (`visibilitychange`, `pagehide`) flushes a
pending save; bodies under 60 KB go out with `keepalive` so a reload inside the debounce
does not lose the last edit. Opening a space fetches its file bytes in parallel and loads each
table as it arrives, in saved order; a failed fetch leaves that file listed as unrestored
rather than aborting the open, and a generation counter discards work from a space that was
switched away from mid-load.

The status bar reports the selected storage backend and browser connectivity; neither
signal proves that a particular write has completed. UI preferences use best-effort
storage access so blocked localStorage does not prevent the shell from rendering.

AI-generated SQL is checked against the live schema. Assistant automatic query execution
uses the read-only gate. The Agent's steps are classified by `src/lib/agent/plan.ts` before
anything runs; writes wait for approval and danger steps for a confirmation, and every run goes
through `executeQuery` + `syncCatalog` like the user's own SQL. A plan step may also create a
notebook (`kind: "notebook"`); that write is approval-gated like the others and goes through the
workspace store's `createNotebook` (`runNotebookStep`), after the space has finished loading (a 15 s timeout). Local AI CLIs run in the host's
bubblewrap sandbox with tools disabled; only the server-side bridge module can reach them. Keep
these boundaries intact.

## Loading and rendering

There is no splash on the normal path: the real shell (navigation, page header, status bar and
the current page) renders as soon as the workspace chunk arrives, and readiness shows locally.
Everything starts in parallel: `src/app/page.tsx` calls `getDB()` as soon as its chunk runs, and
`init` fetches the space index and file bytes without waiting for the engine. (A `<link rel=preload>` for the wasm module was tried and dropped:
Chromium aborted the worker's own streaming compile of the same URL.) `openSpace` awaits `getDB()` only when it loads a file, plugin or view into
DuckDB, so bytes download while the engine instantiates; file order, the generation guard and
per-file error handling are unchanged. Until the engine is up and the space is open, the status bar
reads "Starting engine…" (then "DuckDB vX ready"), the results grid and Home stats show
skeleton rows of their final size, and Run and Agent send are disabled with the title "Engine
starting…" (`runActive` is a no-op too); the editor accepts typing immediately, though restoring the
saved tabs replaces text typed before the space has opened. `Splash` remains only for a fatal engine
error and for the `/shared` link loader.

The browser workspace is dynamically loaded without server rendering. Optional Home, table
page, pipeline, chart, assistant, and dialog surfaces load on demand; `/shared` imports the
engine, store and share decoder after its shell renders. Results virtualize rows; filtering is
deferred to keep text input responsive. Components that sit beside the editor (results grid,
tab bar, status bar, Assistant) select primitives or shallow slices from the store, so the tab
record changing on every keystroke does not re-render them; the status bar's cursor readout is
its own small component.

Query results stream: `executeQuery` runs earlier statements with `query`, then reads the last
one through `collectResult`, which (for read-only statements) pulls Arrow record batches with
`send` and keeps rows only up to the 10,000-row display cap while still counting every row.
Writes, DDL and results with dictionary (ENUM) columns — whose streamed batches carry no
dictionaries — use a plain `query`. DuckDB-Wasm allows one call on a connection at a time:
`getConnection()` queues `query` calls, and `exclusive(fn)` gives a streamed read the connection
to itself until it finishes (a query arriving mid-stream would end it early without an error).
The engine logs warnings only. Profiling and relationship discovery
remain shared work in the workspace store rather than per-component duplicate queries.

Static engine assets are versioned and immutable-cached: `scripts/copy-duckdb-wasm.mjs`
copies DuckDB-Wasm to `public/duckdb/<version>/` (the instance builds the URL from
`PACKAGE_VERSION`), and `scripts/copy-editor-assets.mjs` copies only the Monaco files the
editor actually requests (loader, editor core, SQL tokenizer, editor worker, English messages)
to `public/monaco/<version>/vs`. y-monaco's import of Monaco's ESM build is aliased in
`next.config.ts` (turbopack `resolveAlias`) to `src/lib/monaco-global.ts`, which re-exports
`Range`/`Selection` from the editor instance already loaded, so no second copy is bundled.
`output: "standalone"` with `outputFileTracingExcludes` keeps `sharp`, `public`, sources,
tests, fixtures and runtime data out of the server bundle. `src/lib/editor/monaco-setup.ts`
points the loader at that path and registers the SQL completion provider once per Monaco
instance (a marker on the `monaco` object), so the workbench editor and every notebook cell share
one registration.

Use semantic CSS tokens for both themes; the frame (navigation, page header) uses the same
surface tokens as everything else. Controls come from `src/components/ui/primitives.tsx`
(`btn`, `input`, `Kbd`, `Chip`, `Segmented`, `Tabs`, `Select`, `Menu`, `Dialog`, `DialogFooter`,
`HoverTray`, `SectionLabel`, `KindGlyph`) — see `docs/DESIGN.md`. Dialogs share focus containment
and restoration; menus are portaled, positioned from their trigger and provide arrow-key
navigation. Resize handles expose keyboard controls and current values.

## Verification

- `npm run check`: version alignment, then ESLint and TypeScript in parallel
  (`scripts/run-parallel.mjs`), a production build, and `check:bundle`
  (`scripts/check-browser-bundle.mjs`), which fails if the built browser chunks contain
  `@duckdb/node-api`, `duckdb-node`, `node:fs` or ws server code.
- `npm test`: browser workflows on a dedicated app (3217) and relay (1999), with namespace
  isolation: `e2e/fixtures.ts` sets the `querypad_ns` cookie scoped to the configured `baseURL`,
  so a test never runs in a server's real `default` namespace. Never point the suite at a
  deployed host without that cookie in place. Stop a separately running Next development server
  before testing because Next uses a shared development lock. `PLAYWRIGHT_CHROMIUM_PATH`
  optionally selects an installed Chromium executable.
- `npm run test:cli`: shared discovery, SQL safety, native CLI, agent plan protocol, library,
  results helpers and related unit tests.

Generated browser assets, `.querypad/` inspection artifacts, screenshots, videos, test
reports and `.querypad-data` are runtime/development output, not source changes.
