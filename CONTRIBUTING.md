# Contributing to QueryPad

Thanks for your interest in contributing to QueryPad!

## Development Setup

```bash
git clone https://github.com/adminbjkai/querypad.git
cd querypad
npm install
npm run dev
```

The app will be available at `http://localhost:3000`. To work on collaboration, also run
`npm run collab` and start the app with `NEXT_PUBLIC_COLLAB_URL=ws://localhost:1999/collab`.

QueryPad has two surfaces sharing one engine-agnostic understanding core: a **web
app** (DuckDB-Wasm in the browser) and a **CLI** (native `@duckdb/node-api` in Node).
The product direction is **Cursor for Data** — understanding datasets (discovering
relationships, building semantic models) before generating SQL. See
[ROADMAP.md](ROADMAP.md).

## Project Structure

```
src/
  app/                 # Next.js app router: page.tsx (workspace), shared/ (share links), globals.css
    api/complete/      # server-key AI proxy (same-origin JSON only)
    api/store/         # server file store: index, snippets/, spaces/[id]/, spaces/[id]/files/[name]/
  components/          # React components (web app)
    ui/                # icons, primitives (btn, input, Dialog, Menu, KindGlyph, SectionLabel), Toaster
    workspace/         # shell: Workspace, NavRail, PageHeader, Home, TablePage, StatusBar, SpaceSwitcher,
                       # CommandPalette, ShortcutsDialog, ClearSpaceDialog, BrandMark, Splash
    home/              # Home pieces: Composer, QuickActions, RecentTabs, Onboarding, SemanticModel, format.ts
    assistant/         # answer-only Assistant: AssistantPanel, ChatList, Markdown
    ai/                # ModelPicker (provider + effort)
    editor/            # Monaco workbench: SqlWorkbench, QueryEditor, TabBar, AiAssistant (Ctrl/⌘+K), SnippetDialog
    results/           # grid (DataTable, ColumnMiniChart, sort.ts, column-stats.ts), inspector, stats pane,
                       # ChartPanel/ChartSettings, DetailsView, ExportMenu, ResultsPanel
    sidebar/           # side panel: Sidebar, PanelHeader, TableSchema, ProfileDrawer, RelationshipsPanel,
                       # HistoryPanel, SnippetsPanel
    pipeline/          # PipelineView, PipelineStepCard, PipelineDag, PipelineResults
    collaboration/     # CollaborateDialog, RoomBar, PeerCursors
    dropzone/          # AddFilesDialog (Files | From URL), DropTarget, UrlInput
    plugins/           # PluginManager, PluginVisualization
  cli/                 # querypad CLI: index.ts (dispatch), inspect.ts, ask.ts, explain.ts, artifacts.ts,
                       # render.ts, ai-env.ts
  lib/
    discovery/         # engine-agnostic core: profile.ts, signals.ts, relationships.ts, semantic-model.ts,
                       # explain.ts, sql-safety.ts, numbers.ts (relative imports only)
    duckdb/            # browser DuckDB-Wasm: instance.ts (versioned wasm URL), files.ts, remote.ts, queries.ts,
                       # catalog.ts (sync, signatures, snapshots), catalog-sql.ts (pure), validate.ts
                       # (AI compile check), browser-runner.ts, sql-utils.ts (shared)
    duckdb-node/       # Node DuckDB: connection.ts, load.ts, profile.ts (never imported by app code)
    ai/                # complete.ts (streaming), providers.ts, api-key.ts (BYOK), local-bridge.ts (server),
                       # workspace-context.ts / assistant-context.ts / schema-context.ts (prompts), generate-sql.ts
    agent/             # context.ts (buildAgentContext for "copy for an agent"), ask-context.ts (CLI ask prompt)
    persistence/       # spaces: index.ts (server store first, IndexedDB fallback), browser.ts (IndexedDB),
                       # snapshot.ts (skip unchanged saves)
    server-store/      # fs-store.ts (QUERYPAD_DATA_DIR records with revs), http.ts (route helpers)
    collaboration/     # Yjs sync (tabs, per-tab text) and file-sync.ts (5 MB per file, 24 MB per room)
    sharing/           # encode.ts / decode.ts for share links (data + query in the URL)
    charts/            # chart builder: detect.ts, aggregate.ts, format.ts, png.ts
    export/            # csv, json, markdown, html, excel, parquet, clipboard
    pipeline/          # graph.ts (dependencies), execute.ts
    plugins/           # registry.ts (visualization, exporter, fileLoader, transform extensions)
    xlsx/              # Excel parsing
    hooks/             # use-focus-trap.ts
    workspace-actions.ts  editor-bridge.ts  import.ts  monaco-global.ts (y-monaco shim)  monaco-theme.ts
    preferences.ts  constants.ts  utils.ts
  stores/              # Zustand: workspace-store (spaces, tables, tabs, history, pipelines, saves and live sync),
                       # ui-store (theme, page, panels, dialogs, toasts), ai-store (model, effort),
                       # assistant-store (chats), snippet-store (shared library), collaboration-store
  types/               # TypeScript type definitions (discovery.ts, pipeline.ts, plugin.ts, snippet.ts, …)
scripts/               # copy-duckdb-wasm, copy-editor-assets (postinstall), check-version,
                       # check-browser-bundle (after build), run-parallel (lint + typecheck)
collab/server.mjs      # self-hosted collaboration relay (plain Node ESM)
local-ai/              # host-side AI bridge (bridge.mjs, sandbox.mjs) for signed-in CLIs
test/                  # Node test runner specs for discovery, AI layer, catalog, persistence, collaboration
e2e/                   # Playwright specs for the web app
fixtures/data/         # sample related files for CLI inspection
```

> Node-only code (`src/cli`, `src/lib/duckdb-node`) must not be imported by app code —
> it would pull the native DuckDB addon into the browser bundle.

## Running the CLI

```bash
npm run querypad -- inspect ./fixtures/data
# writes ./fixtures/data/.querypad/ (gitignored)
```

## How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run the local checks (`npm run check`)
5. Run the e2e tests (`npm test`, starts its own dev server on port 3217 and a relay on 1999)
   for UI changes, and `npm run test:cli` for discovery/CLI/AI/collaboration changes
6. Commit your changes
7. Push to your fork and open a Pull Request

## Guidelines

- Keep PRs focused — one feature or fix per PR
- Use the semantic color tokens in `src/app/globals.css` (`bg-surface`, `text-muted`,
  `text-k-num`, …) rather than raw Tailwind palette colors, so both themes keep working
- Follow existing code style and conventions
- Test your changes locally before submitting
- Keep `package.json`, `package-lock.json`, and the latest `CHANGELOG.md` release version in sync

## Reporting Issues

- Use [GitHub Issues](https://github.com/adminbjkai/querypad/issues)
- Include steps to reproduce, expected behavior, and actual behavior
- Screenshots are helpful for UI-related issues

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
