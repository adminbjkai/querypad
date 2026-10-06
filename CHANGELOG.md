# Changelog

QueryPad is a web app, not an npm package. Version numbers mark GitHub release
milestones and public product updates.

## Unreleased

Nothing yet.

## v0.9.0 — Your workspace on every device

- Spaces (tables, views, tabs, AI conversations, history, pipelines, join verdicts) are now
  saved on the server through a new `/api/store` API instead of only in the browser, so every
  device and browser opens the same workspace
- Live sync: open clients check for changes every 3 seconds (and on focus) and apply edits
  made on other devices — tab text, history and verdicts in place; new or changed tables,
  views and plugins by reopening the space. New, renamed and deleted spaces show up too.
  Unsaved local edits are never pulled over
- Spaces already saved in a browser are uploaded automatically the first time it opens an
  empty server; without the storage API (static hosting) the app keeps using IndexedDB
- Docker: the web container stores data in `/data` (`QUERYPAD_DATA_DIR`), mounted as the
  `querypad-data` volume

## v0.8.0 — Spaces, SQL-created tables, and an AI that keeps the thread

### Spaces

- Keep several saved workspaces in the browser. The space menu (next to the logo, or the
  command palette) can save the current space as a new one, start a fresh space from the
  sample-data template or empty, switch, rename and delete
- Each space has its own tables, views, tabs, AI conversations, run history, pipelines,
  plugins and join verdicts; switching leaves a live room (rooms belong to one space)
- Saved data from earlier versions is migrated into a space called "My workspace"; first-time
  visitors get a "Playground" space with the two sample tables
- Shared links: "Save as a new space" keeps a copy without touching your other spaces

### Tables you create with SQL

- The sidebar now follows DuckDB's catalog: after `CREATE TABLE`, `CREATE VIEW`, `INSERT`,
  `UPDATE`, `DELETE`, `ALTER` or `DROP`, new and changed tables appear (with row counts and
  columns) and dropped ones disappear
- New or changed tables are saved as Parquet snapshots, so they survive reloads, travel in
  share links, and sync to collaborators like any loaded file
- Views are listed (marked "view"), recreated from their SQL when a space opens, and can be
  dropped from the sidebar
- Joins are re-discovered for SQL-created tables like for loaded files. Empty tables
  (`CREATE TABLE … WHERE FALSE`) are linked by an explicit id-name reference
  (`employee_bio.emp_id` → `employees.emp_id`), marked "name match" and capped at 60%
  confidence; the CLI's `relationships.md` shows their overlap as "n/a (empty)"
- `WITH … INSERT/UPDATE/DELETE` statements are recognised as writes, so their changes are saved
- Snapshots keep exact types where Parquet can't: 128-bit integers (e.g. `SUM` results) are
  stored as `DECIMAL(38,0)` and `UNION` columns as text
- Saved views whose table can't be reopened (or was dropped) are kept, not silently deleted

### AI assistant

- Conversations: each tab keeps its thread (saved with the space). Follow-ups are sent with
  the earlier requests and the SQL produced, so "now select everything, properly linked"
  builds on the previous answer. "New conversation" starts over
- Richer context on every request: column hints from profiles (value ranges, the values of
  low-cardinality columns, uniqueness), views, empty tables, joins ordered by verdict
  (rejected joins are named as off-limits, name-only joins are labelled), the last 12 runs
  with their errors, and the editor's SQL
- Compile check: each answer is tried against your real tables on a separate connection in
  a transaction that is always rolled back — queries are only planned (EXPLAIN), changes are
  undone. Batches with transaction control (`BEGIN`/`COMMIT`…), file, extension or setting
  statements aren't test-run and are labelled "not checked". If it doesn't compile, the
  model gets DuckDB's error and one chance to fix it; the result is labelled "compiles" or
  shows the error
- Inferred keys are queryable: `querypad.relationships` and `querypad.keys` are kept up to
  date in DuckDB, and the assistant uses them for questions about keys and relationships
  (files have no declared constraints, so `information_schema` can't answer those)
- Multi-turn requests work with every provider (Anthropic, OpenAI, and the OpenAI-compatible
  ones) and through the server-key proxy, which validates the history it forwards

### Fixes and cleanup

- README: restored the Quick start, self-hosting and tech-stack sections lost in v0.7.0;
  repository links now point to adminbjkai/querypad
- Removed the unused `generateSql` helper (the CLI keeps its prompt helpers)

## v0.7.0 — Workspace redesign

### Redesigned web app

- New visual system with light and dark themes (follows your OS, toggle anytime), Schibsted
  Grotesk + JetBrains Mono, and a column-kind color code (number, text, date, boolean)
  used consistently in the sidebar, result headers and profiles; join keys get their own color
- Command palette (Ctrl/⌘+P): run, ask AI, jump to tabs, preview or profile any table,
  reopen past queries, switch theme and mode
- Resizable editor/results split (drag, arrow keys, double-click to reset; remembered)
- Sidebar with Tables, Joins and History panels; collapsible (Ctrl/⌘+B), overlay on phones
- Click a column to insert its name at the cursor; join keys are marked in the table tree
- Joins panel: "Insert JOIN" writes the correct `JOIN … ON …` clause; discovery now runs
  automatically in the background once two tables are loaded
- Results: click a header to sort, filter rows inline, click any cell to copy, numbers
  right-aligned, NULLs styled, auto-sized columns
- Query history (last 100 runs, with rows, timing and failures) — reopen or rerun
- Run just the selected SQL with Ctrl/⌘+Enter
- Failed queries offer "Fix with AI", which sends the query and error to the assistant
- AI assistant: provider picker, streamed output with Stop, "Use and run", "Replace query"
  and "Insert at cursor"; relationship-aware prompts (inferred joins are passed as context)
- Pipelines, charts, profiles, export menu and dialogs restyled; charts follow the theme
- Keyboard shortcuts reference (press `?`); clearer empty, loading and error states
- Clearing the workspace now asks for confirmation

### Collaboration that works out of the box

- Replaced PartyKit with a small self-hosted Yjs relay (`collab/server.mjs`); the app
  connects to `/collab` on the same origin by default
- Invite links (`/?room=<id>`) join a room directly; starting a room copies the link
- Fixed: a peer's edits no longer wipe your results or switch your active tab; tab lists sync
  only when they actually change; every tab's text stays in sync, not just the visible one
- Files under 5 MB sync automatically to everyone in the room (stored as binary, not number arrays)

### AI providers

- One streaming implementation shared by Groq, Ollama Cloud, OpenRouter and xAI
  (OpenAI-compatible), plus Anthropic and OpenAI
- Keys configured on the server are detected at runtime (`GET /api/complete`) and proxied, so
  they never reach the browser; the assistant defaults to a provider the server can serve
- Requests are cancellable; input size and token limits are enforced server-side
- Fixed: the CLI could not use server-proxied providers; Groq model id corrected
  (`openai/gpt-oss-120b`); default Claude model is now Sonnet 5.5 (`claude-sonnet-5-5`)

### Faster and lighter

- One profiler for browser and CLI (`src/lib/discovery/profile.ts`): column stats come from a
  single scan per table (68 → 26 queries on the sample folder), output unchanged
- Discovery reuses profiles you already built instead of profiling every table again
- Query results convert only the displayed 10,000 rows out of Arrow memory
- Imported files are released from DuckDB's virtual file system after loading
- Saved workspaces keep file bytes in their own IndexedDB records, so typing no longer
  rewrites every loaded file; older saves migrate automatically
- Shared links never overwrite the workspace saved in your browser ("Make this my workspace"
  adopts them explicitly)
- Docker image uses the Next.js standalone server (no full `node_modules`), runs as non-root,
  and excludes unused native image libraries

### Fixes

- Ctrl/⌘+Enter ran the query as it was when the editor first mounted
- SQL autocomplete registered a new provider on every tab switch (duplicate suggestions)
- Column-type classification treated `INTERVAL`, `STRUCT`, `LIST` and arrays as numbers
- Profile date ranges showed epoch milliseconds in the browser
- Parquet export failed on queries ending in `;` or with several statements
- Dropping files on the page didn't share them with collaborators

### Removed

- PartyKit (`partykit`, `y-partykit`, `party/`), Vercel Analytics, the unused built-in
  heatmap plugin, Next.js boilerplate SVGs


### Web: Relationship Verification

- New Relationships panel in the sidebar: runs the same discovery engine in the browser
  (DuckDB-Wasm) and lists inferred joins with confidence and a per-signal "why"
- Accept / Reject / Edit each relationship to curate the AI's assumptions; verdicts and
  edits persist across refresh (IndexedDB)
- Reuses the engine-agnostic `src/lib/discovery` core (no logic duplicated between CLI and web)

### CLI: Dataset Understanding

- New `querypad inspect <folder>` command that profiles a folder of data files and
  infers foreign-key relationships with confidence scores
- New `querypad ask "<question>" <folder>` command (AI Analyst): generates SQL using the
  inferred relationships as context, runs it on DuckDB, and explains the result
- `inspect` now builds a semantic model (named business entities with belongs_to/has_many)
  and writes `.querypad/semantic-model.yaml`; `ask` feeds those entities as context too
- New `querypad explain <folder>` command: justifies each inferred relationship from its
  signals (value overlap, name match, type, cardinality) and lists caveats to verify
- Generated SQL is read-only-gated (only SELECT/WITH/EXPLAIN/… execute) and code-fence stripped
- CLI AI keys come from `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`; provider via `--provider`
- Writes `.querypad/` artifacts (`schema.json`, `relationships.json`, `inspect-summary.md`)
  for AI agents such as Claude Code to reason about the dataset
- Engine-agnostic discovery core shared between the browser app and the Node CLI
- Runs on a native Node DuckDB engine (`@duckdb/node-api`), separate from the browser Wasm engine

### Multi-Provider BYOK

- OpenAI BYOK support for the Cmd+K AI SQL assistant via the Responses API
- Provider selector for Claude and OpenAI with independent browser-local keys
- Added `gpt-5.5` as the default OpenAI model

### Data Profile & Agent Context

- On-demand data profile drawer for loaded tables
- Column-level nulls, distinct counts, numeric ranges, averages, and top values
- Copy Agent Context action for Codex, Claude Code, or other coding agents
- README positioning updated around local-first OSS and the hosted demo

## v0.6 — Open-Source Release

- Vercel Analytics integration
- OG image and Twitter card metadata for social sharing
- Playwright e2e test suite
- CONTRIBUTING.md and project metadata
- CI, version metadata checks, and agent guidance for release hygiene

## v0.5 — Query Engine Fixes

- DATE and TIMESTAMP columns now display as human-readable ISO strings instead of raw epoch milliseconds
- DECIMAL values now display correctly with proper scale (e.g. `0.3` instead of `3`)
- Multi-statement SQL support — semicolon-separated queries execute sequentially, last result displayed
- Share URL v2 binary format — eliminates double base64 encoding, supports larger datasets reliably
- Backward-compatible decoding for existing v1 share links
- Clean floating-point display — removes IEEE 754 noise (e.g. `869.8600000000001` → `869.86`)

## v0.4 — Onboarding & File Management

- Sample data pre-loaded on first visit with welcome banner
- Global drag-and-drop — drop files anywhere on the workspace
- Add file modal with drag area, browse, and URL input
- Per-table delete (hover X button in sidebar)
- Auto-cleanup of sample data when user adds own files
- File size validation (100 MB hard limit, 50 MB soft warning)

## v0.3 — Collaboration & Extensibility

- Transform pipelines with DAG visualization
- Plugin system (4 extension types via ES module URL)
- Real-time collaboration (PartyKit + Y.js CRDT)

## v0.2 — Power Features

- Multi-format export (CSV, JSON, Markdown, HTML, Excel, Parquet)
- Multi-tab editor with IndexedDB persistence
- S3/HTTP remote file loading
- AI SQL assistant (BYOK streaming)

## v0.1 — Core

- IndexedDB persistence
- Excel (.xlsx) support
- HTML export
- Inline charts with auto-detection
