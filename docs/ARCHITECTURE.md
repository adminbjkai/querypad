# QueryPad architecture

QueryPad has two execution surfaces and one dataset-understanding core. The browser
runs DuckDB-Wasm; the CLI runs native DuckDB. Keep runtime-specific imports at the edges.

## Runtime boundaries

| Layer | Location | Responsibility |
| --- | --- | --- |
| Web shell | `src/components/workspace`, `src/components/home` | Navigation rail, page header, Home, table page, spaces, status, command palette |
| Analysis UI | `src/components/editor`, `results`, `sidebar`, `pipeline`, `assistant` | Interactive workflows over store state |
| Shared UI | `src/components/ui`, `src/lib/hooks` | Semantic controls, dialogs, menus, focus lifecycle |
| Workspace actions | `src/lib/workspace-actions.ts` | Cross-component run, preview, snippet, share, context actions |
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
  results, query history, pipelines and plugins. DuckDB's main catalog is authoritative:
  after a write, `syncCatalog` reads the catalog plus one column/row-estimate signature per
  relation (`readCatalogSignatures`) and only describes and re-snapshots tables that the
  statement named (`mutationTargets`) or whose signature moved. A write it cannot attribute
  (MERGE, EXECUTE, CALL …) makes `mutationTargets` return `null`, and every table is checked
  exactly.
- `ui-store`: theme, current page (Home, workbench or a table page with its selected dataset and
  tab), the open side panel, navigation collapse, dialogs, sizes, cursor, toasts and per-space
  dismissal of the sample-data banner. The page is session UI state; it never changes a remote
  device's saved space. An empty space shows Home; data arriving opens the workbench; switching
  spaces leaves a table page. The Explorer's quick profile view closes whenever the page or the
  side panel changes.
- `ai-store`: current model, effort and available providers. The status bar subscribes
  directly, avoiding a second cached model label or periodic UI polling.
- `assistant-store`: answer-only chats, streaming and tool execution. Each space keeps up to
  30 chats in localStorage (`querypad:assistant:v2:<space>`); answers always land in the chat
  they started in. It follows the open space itself, so Home can send before the panel opens.
  The SQL-writing assistant stores its thread with the query tab instead.
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
mtime).

State saves are debounced 400 ms (1200 ms while typing in the editor) and compared against
the last written snapshot (`src/lib/persistence/snapshot.ts`): an unchanged record is not
sent, and the space index is only patched when the table count changed or the entry's
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
uses the read-only gate. Local AI CLIs run in the host's bubblewrap sandbox with tools
disabled; only the server-side bridge module can reach them. Keep this boundary intact.

## Loading and rendering

The browser workspace is dynamically loaded without server rendering. Optional Home, table
page, pipeline, chart, assistant, and dialog surfaces load on demand; `/shared` imports the
engine, store and share decoder after its shell renders. Results virtualize rows; filtering is
deferred to keep text input responsive. Components that sit beside the editor (results grid,
status bar, Assistant) select primitives or shallow slices from the store, so the tab record
changing on every keystroke does not re-render them. Profiling and relationship discovery
remain shared work in the workspace store rather than per-component duplicate queries.

Static engine assets are versioned and immutable-cached: `scripts/copy-duckdb-wasm.mjs`
copies DuckDB-Wasm to `public/duckdb/<version>/` (the instance builds the URL from
`PACKAGE_VERSION`), and `scripts/copy-editor-assets.mjs` copies only the Monaco files the
editor actually requests (loader, editor core, SQL tokenizer, editor worker, English messages)
to `public/monaco/<version>/vs`. y-monaco's import of Monaco's ESM build is aliased in
`next.config.ts` (turbopack `resolveAlias`) to `src/lib/monaco-global.ts`, which re-exports
`Range`/`Selection` from the editor instance already loaded, so no second copy is bundled.
`output: "standalone"` with `outputFileTracingExcludes` keeps `sharp`, `public`, sources,
tests, fixtures and runtime data out of the server bundle.

Use semantic CSS tokens for both themes; the frame (navigation, page header) uses the same
surface tokens as everything else. Dialogs share focus containment and restoration; menus provide arrow-key
navigation. Resize handles expose keyboard controls and current values.

## Verification

- `npm run check`: version alignment, then ESLint and TypeScript in parallel
  (`scripts/run-parallel.mjs`), a production build, and `check:bundle`
  (`scripts/check-browser-bundle.mjs`), which fails if the built browser chunks contain
  `@duckdb/node-api`, `duckdb-node`, `node:fs` or ws server code.
- `npm test`: browser workflows on a dedicated app (3217) and relay (1999), with namespace
  isolation. Stop a separately running Next development server before testing because Next
  uses a shared development lock. `PLAYWRIGHT_CHROMIUM_PATH` optionally selects an installed
  Chromium executable.
- `npm run test:cli`: shared discovery, SQL safety, native CLI and related unit tests.

Generated browser assets, `.querypad/` inspection artifacts, screenshots, videos, test
reports and `.querypad-data` are runtime/development output, not source changes.
