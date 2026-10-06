# QueryPad architecture

QueryPad has two execution surfaces and one dataset-understanding core. The browser
runs DuckDB-Wasm; the CLI runs native DuckDB. Keep runtime-specific imports at the edges.

## Runtime boundaries

| Layer | Location | Responsibility |
| --- | --- | --- |
| Web shell | `src/components/workspace`, `src/components/home` | Navigation rail, page header, Home, spaces, status, command palette |
| Analysis UI | `src/components/editor`, `results`, `sidebar`, `pipeline`, `assistant` | Interactive workflows over store state |
| Shared UI | `src/components/ui`, `src/lib/hooks` | Semantic controls, dialogs, menus, focus lifecycle |
| Workspace actions | `src/lib/workspace-actions.ts` | Cross-component run, preview, snippet, share, context actions |
| Browser engine | `src/lib/duckdb` | Wasm lifecycle, query execution, catalog reconciliation |
| Understanding core | `src/lib/discovery` | Profiles, relationship signals, explanations, semantic models |
| Native engine and CLI | `src/lib/duckdb-node`, `src/cli` | Local folder loading and command execution; never imported by app code |
| AI | `src/lib/ai` | Provider streaming, context construction, SQL checks, bridge access |
| Persistence | `src/lib/persistence`, `src/lib/server-store` | Server records and revision tracking, IndexedDB fallback |
| Collaboration | `src/lib/collaboration`, `collab/server.mjs` | Yjs documents and a separately hosted relay |

Shared discovery and AI code uses relative imports so the CLI can execute under tsx.
Discovery consumes a `QueryRunner`, not either DuckDB implementation. The browser
Home derives its entities with `buildSemanticModel`, filters rejected joins, and reads
existing profiles; it does not maintain a second catalog or launch its own profiling loop.

## State ownership

- `workspace-store`: spaces, tables/views, profiles, relationship verdicts, SQL tabs,
  results, query history, pipelines and plugins. DuckDB's main catalog is authoritative.
- `ui-store`: theme, current page (Home or workbench), the open side panel, navigation
  collapse, dialogs, sizes, cursor and toasts. The page is session UI state; it never changes a
  remote device's saved space. An empty space shows Home; data arriving opens the workbench.
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
someone is using the page and every 15 s when it sits idle; the server parses each polled
record (index, space revs, snippets) once per file version (inode, size, mtime).

The status bar reports the selected storage backend and browser connectivity; neither
signal proves that a particular write has completed. UI preferences use best-effort
storage access so blocked localStorage does not prevent the shell from rendering.

AI-generated SQL is checked against the live schema. Assistant automatic query execution
uses the read-only gate. Local AI CLIs run in the host's bubblewrap sandbox with tools
disabled; only the server-side bridge module can reach them. Keep this boundary intact.

## Loading and rendering

The browser workspace is dynamically loaded without server rendering. Optional Home,
pipeline, chart, assistant, and dialog surfaces load on demand. Results virtualize rows;
filtering is deferred to keep text input responsive. Profiling and relationship discovery
remain shared work in the workspace store rather than per-component duplicate queries.

Use semantic CSS tokens for both themes; the frame (navigation, page header) uses the same
surface tokens as everything else. Dialogs share focus containment and restoration; menus provide arrow-key
navigation. Resize handles expose keyboard controls and current values.

## Verification

- `npm run check`: version alignment, ESLint, TypeScript, and a production build. The build
  also verifies that native DuckDB has not entered the browser dependency graph.
- `npm test`: browser workflows on a dedicated app (3217) and relay (1999), with namespace
  isolation. Stop a separately running Next development server before testing because Next
  uses a shared development lock. `PLAYWRIGHT_CHROMIUM_PATH` optionally selects an installed
  Chromium executable.
- `npm run test:cli`: shared discovery, SQL safety, native CLI and related unit tests.

Generated browser assets, `.querypad/` inspection artifacts, screenshots, videos, test
reports and `.querypad-data` are runtime/development output, not source changes.
