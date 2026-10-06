# QueryPad

> **A local-first data workspace that understands your datasets, not just runs SQL on them.**

Drop in CSV, Parquet, JSON or Excel files. QueryPad loads them into DuckDB right in your
browser, profiles every column, works out which tables join to which, and lets you query
them in SQL or plain English — with no server-side data processing and no account.

The execution layer is solved (DuckDB does it well). The unsolved problem is that
**people don't understand their data**: which tables exist, what each field means,
how datasets connect, which join is correct. QueryPad answers those questions first,
then helps you write and run the SQL.

This repository ([adminbjkai/querypad](https://github.com/adminbjkai/querypad)) is the
**web edition**: the browser workspace plus the `querypad` CLI. It started as a fork of
[vericontext/querypad](https://github.com/vericontext/querypad), which has since become a
terminal-first project; its history is kept on the `upstream-main` branch.

## Two surfaces, one understanding engine

QueryPad ships as a **CLI** for dataset understanding and a **browser app** for
interactive analysis. Both share the same engine-agnostic discovery core; only the
DuckDB binding differs (native `@duckdb/node-api` for the CLI, DuckDB-Wasm for the web).

```text
                 ┌─────────────────────────┐
  folder of  →   │  Discovery core         │  → .querypad/ artifacts
  data files     │  profile → relationships│     (schema + relationships)
                 │  → semantic model        │
                 └───────────┬─────────────┘
                  CLI (Node) │ Web (Wasm)
                 querypad    │ browser app
                 inspect     │ drop & query
```

## CLI: dataset understanding

```bash
querypad inspect ./data
```

Scans a folder, profiles every file, and infers foreign-key relationships with
confidence scores:

```text
Tables:        3
Relationships: 2
  payments.user_id ↳ users.id  (100%, many-to-one)
  events.user_id   ↳ users.id  (100%, many-to-one)

Wrote artifacts to ./data/.querypad
```

It writes machine-readable artifacts that an AI agent (Claude Code, Cursor, …) can
read to reason about the dataset instead of guessing at pandas:

```text
.querypad/
  schema.json          # tables, columns, types, per-column profiles
  relationships.json   # inferred joins with confidence + signals
  semantic-model.yaml  # named business entities (belongs_to / has_many)
  inspect-summary.md   # human- and agent-readable overview
```

`inspect` also rolls the relationships into a semantic model of named entities:

```yaml
# .querypad/semantic-model.yaml
entities:
  - name: User
    table: users
    has_many: [Payment, Event]
  - name: Payment
    table: payments
    belongs_to: [User]
```

```text
Claude Code  +  QueryPad  +  DuckDB
```

## How relationship discovery works

For every table, QueryPad computes a statistical profile (row count, null %,
distinct count, ranges, top values). It then identifies primary-key candidates
(unique, non-null), prunes likely foreign-key pairs by **name similarity** and
**type compatibility**, and runs a **value-overlap** query for each survivor. A
confidence score blends four signals — value overlap (dominant), name similarity,
type match, and cardinality shape — and competition disambiguation keeps a foreign
column pointed at its single strongest target, so overlapping integer id ranges
don't produce false positives. A table with no rows yet (for example
`CREATE TABLE … AS SELECT … WHERE FALSE`) has no values to compare; its columns are linked
only when their name clearly references an id key (`emp_id` → `employees.emp_id`), and the
join is marked "name match" with a confidence capped at 60% so you verify it.

## Product layers

| Layer | What it does | Status |
|-------|--------------|--------|
| **1 — Dataset Discovery** | Scan folders; detect schema, types, statistics, uniqueness, cardinality | ✅ Built (`profile`) |
| **2 — Relationship Discovery** | Infer joins automatically with confidence scores | ✅ Built (`inspect`) |
| **3 — Semantic Model** | Roll relationships into named business entities (`User ├ Payment ├ Event`) | ✅ Built (`inspect`) |
| **4 — AI Analyst** | Natural-language questions → SQL → execution → insight (`ask`) | ✅ Built (`ask`) |

See [ROADMAP.md](ROADMAP.md) for the full plan.

## CLI: ask a question

```bash
export OPENROUTER_API_KEY=...               # any provider in the table below
querypad ask "total payment amount by user plan" ./data --provider openrouter
```

`ask` builds context from the inferred relationships (so the generated SQL joins on the
right keys), runs it on DuckDB, and explains the result:

```text
-- SQL
SELECT u.plan, COUNT(*) AS payment_count, SUM(p.amount) AS total
FROM payments p JOIN users u ON p.user_id = u.id
GROUP BY u.plan ORDER BY u.plan

plan  payment_count  total
----  -------------  ------
paid  8              285.74

Insight: All payments come from paid-plan users.
```

Generated SQL is read-only-gated (only `SELECT`/`WITH`/… execute) and the DB is in-memory,
so source files are never modified. Use `--show-sql` to preview the SQL without running it.

## CLI: explain why

```bash
querypad explain ./data
```

Justifies each inferred relationship from its stored signals, and lists caveats to verify:

```text
payments.user_id ↳ users.id — 100% (many-to-one)
  • 100% of distinct payments.user_id values are present in users.id
  • column name strongly matches the target
  • exact type match
  • many-to-one (target key is unique)

Caveats (0)
  None.
```

## Web app: interactive analysis

DuckDB runs in your tab (WebAssembly). Your spaces are saved on the QueryPad server you
use, so every device you open it on sees the same workspace — and open tabs pick up changes
made elsewhere within a few seconds. Served without its storage API (static hosting), it
falls back to keeping everything in the browser.

- **Drop anything** — CSV, TSV, Parquet, JSON/NDJSON, Excel; several at once, then JOIN them
- **Understands before you ask** — every column is profiled (types, empties, distinct counts,
  ranges, top values) and joins between tables are inferred in the background
- **Verify the joins** — the Joins panel lists inferred relationships with confidence and a
  per-signal "why"; Accept / Reject / Edit them, or insert the `JOIN … ON …` clause directly
- **SQL with a real editor** — Monaco with table/column autocomplete; Ctrl/⌘+Enter runs the
  query, or only the selected part
- **Tables you create with SQL are first-class** — `CREATE TABLE`, `CREATE VIEW`, `INSERT`,
  `ALTER`, `DROP`… the sidebar follows DuckDB's catalog, and new or changed tables are saved
  (as Parquet snapshots) so they survive reloads, travel in share links and sync to rooms
- **The Assistant** — Ctrl/⌘+I opens a chat on the right that sees the whole workspace:
  tables with value hints, joins, open tabs, the current result, recent runs, snippets and
  spaces. It answers in the chat — looking things up with read-only queries when it needs
  actual values — and never changes your workspace. Drag its edge to resize it, or collapse
  it to a slim strip. One conversation per space
- **AI models without API keys** — on a self-hosted server, QueryPad can use the AI CLIs
  already signed in on that machine: Claude Sonnet 5.5, Codex GPT-6 Luna and Grok 4.7 (each
  with a low/medium effort toggle), plus Cursor's Grok 4.7 Medium Fast (256k) and Composer
  2.5. Pick one from the model menu; API-key providers are still there too
- **Ask AI in the editor** — Ctrl/⌘+K opens a conversation per tab. Each
  request carries your schemas with column hints, the inferred joins (accepted ones first,
  rejected ones excluded), your recent runs and their errors, and the earlier turns, so
  follow-ups like "now join everything" build on what came before. Every answer is compiled
  against your tables before you see it, and fixed automatically once if it doesn't compile
- **Keys you can query** — loaded files have no declared PRIMARY/FOREIGN KEY constraints, so
  QueryPad publishes what it inferred as `querypad.relationships` and `querypad.keys`:
  `SELECT * FROM querypad.keys` lists every key column and what it references
- **Spaces, on every device** — keep several saved workspaces on the server: save the current one as a new
  space, start a fresh space from the sample template or empty, switch, rename, delete
- **Snippet library** — save SQL you reuse (Ctrl/⌘+Shift+S) into folders; search it, insert at
  the cursor, run it in a tab, or autocomplete it by name. Shared by every space and device;
  export/import as JSON
- **A results grid like a desktop tool** — mini distribution charts under each header,
  range selection with a Sum / Avg / Min / Max footer, sticky headers and row numbers, resizable
  columns, NULLs marked, keyboard cell navigation with Ctrl/⌘+C, a per-column menu (sort, copy
  name or values, inspect), a column inspector with distribution, nulls, distinct values and
  top values, a Details view with the SQL and timings, and export to CSV /
  JSON / Markdown / HTML / Excel / Parquet / clipboard
- **Charts and column stats like Snowsight** — a chart builder (bar, line, area, scatter,
  pie, scorecard; date buckets, aggregations, group-by, stacking, PNG download) and a stats
  pane listing every column with its distribution
- **Workspace overview** — a live catalog with search and sorting, row and profile counts,
  relationship review status, semantic entities, and recent queries. Preview a dataset,
  inspect its columns, start a query, or copy agent context from one place
- **Explorer, history and status bar** — a searchable explorer for tables, views and columns
  on a slim activity rail; history search with a succeeded/failed filter; a status bar with
  the engine, space, storage location, last result and the active AI model; Format SQL
  (Shift+Alt+F)
- **Search everything** — Ctrl/⌘+P finds tables, columns, snippets, history, tabs and spaces,
  and runs any command
- **History** — each space keeps its last 100 runs with row counts, timings and failures
- **Pipelines** — chain named SQL steps that build on each other, shown as a dependency graph
- **Live collaboration** — start a room, send the invite link, and edit the same tabs with
  shared cursors; files under 5 MB sync to everyone
- **Share links** — compress data + query into one URL (no server involved); opening a link
  never touches your spaces ("Save as a new space" keeps a copy)
- **Agent context** — copy schema, profiles, the current SQL and its results for Claude Code,
  Codex or any agent
- **A considered design system** ([`docs/DESIGN.md`](docs/DESIGN.md)) with a navy masthead,
  semantic surface colors, Inter + JetBrains Mono, matching light and dark themes,
  skeleton loading, and a home screen for empty spaces
- **Light and dark themes**, keyboard-first (press `?` for shortcuts), works on phones

<details>
<summary><strong>More web app details</strong></summary>

- **Persistence** — each space's tables, views, tabs, SQL-generation conversations, history, pipelines and
  join verdicts are saved through `/api/store` to the server's data directory
  (`QUERYPAD_DATA_DIR`, a Docker volume in the compose setup; `.querypad-data/` in dev).
  Open clients poll every 3 s and apply edits from other devices; table, view and plugin
  changes reopen the space. Spaces already kept in a browser's IndexedDB are uploaded the
  first time that browser meets an empty server, and older layouts are migrated into a space
  called "My workspace". Assistant chat conversations stay in localStorage per space. Without the API the app keeps using IndexedDB. The server store has
  no accounts of its own — protect the site (e.g. basic auth) if it's reachable publicly. The first visit creates a "Playground"
  space with two sample tables.
- **Remote files** — load Parquet/CSV/JSON from any URL that allows cross-origin requests
- **Plugin system** — ES-module plugins can add visualizations, exporters and file loaders
- **Guardrails** — 100 MB per file, with a warning above 50 MB; results show the first
  10,000 rows (Parquet export writes them all)
- **What the AI receives** — table and view schemas, column hints (value ranges and the
  values of low-cardinality columns), joins, the last 12 runs, the editor's SQL, and up to 8
  earlier turns for SQL generation. Column hints can include example values. The answer-only
  Assistant also receives a bounded preview of the active result and results of its allowed
  read-only queries, plus snippet context.

</details>

### Keyboard shortcuts

| Action | Keys |
|--------|------|
| Run query (or the selection) | Ctrl/⌘ + Enter |
| Ask AI to write SQL | Ctrl/⌘ + K |
| Command palette | Ctrl/⌘ + P |
| Assistant chat | Ctrl/⌘ + I |
| Save query as a snippet | Ctrl/⌘ + Shift + S |
| Format SQL | Shift + Alt + F |
| Toggle sidebar | Ctrl/⌘ + B |
| Resize editor/results split | Focus separator, then ↑ / ↓; Home / End |
| Resize a result column | Focus its resize handle, then ← / →; Home to fit |
| Navigate a menu | ↑ / ↓, Home / End, Enter; Escape to close |
| Shortcut list | ? |

### AI providers

**Signed-in CLIs (no API key).** When the server runs the local AI bridge
([`local-ai/`](local-ai/README.md)), these appear under "Signed in on this server":

| Model | Through | Effort |
|-------|---------|--------|
| Claude Sonnet 5.5 (`claude-sonnet-5-5`) | Claude Code CLI | low / medium |
| GPT-6 Luna (`gpt-6-luna`) | Codex CLI | low / medium |
| Grok 4.7 (`grok-4.7`) | Grok CLI | low / medium |
| Grok 4.7 Medium Fast, 256k (`grok-4.7-medium-fast`) | Cursor CLI | fixed |
| Composer 2.5 (`composer-2.5`) | Cursor CLI | fixed |

The bridge runs each CLI in a bubblewrap sandbox with its tools switched off, in an empty
scratch folder, so text in your data can't make an agent touch the host.

**API-key providers:**

| Provider | Model | Key |
|----------|-------|-----|
| Groq | `openai/gpt-oss-120b` | `GROQ_API_KEY` |
| Ollama Cloud | `deepseek-v4.1-flash` | `OLLAMA_API_KEY` |
| OpenRouter | `deepseek/deepseek-v4.1-flash` | `OPENROUTER_API_KEY` |
| xAI | `grok-4.7` | `XAI_API_KEY` |
| Anthropic | `claude-sonnet-5-5` | `ANTHROPIC_API_KEY` |
| OpenAI | `gpt-5.5` | `OPENAI_API_KEY` |

In the browser you can paste your own key for any provider (kept in `localStorage`, sent
straight to the provider). If the server has a key in its environment, the assistant uses it
through `/api/complete` instead — the key never reaches the browser, and the endpoint only
accepts same-origin JSON requests. The CLI reads the same environment variables.

## Quick start

**Web app (development):**

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Your first visit creates a "Playground" space with sample data.

For live collaboration in development, also run the relay and point the app at it:

```bash
npm run collab                                   # relay on ws://localhost:1999/collab
NEXT_PUBLIC_COLLAB_URL=ws://localhost:1999/collab npm run dev
```

**CLI:**

```bash
npm install
npm run querypad -- inspect ./fixtures/data            # profile + discover relationships
OPENROUTER_API_KEY=... npm run querypad -- ask "payments by plan" ./fixtures/data --provider openrouter
```

## Self-hosting (Docker)

```bash
docker compose up -d --build
```

This starts two containers from one image:

| Service | Listens on | Purpose |
|---------|-----------|---------|
| `querypad` | `127.0.0.1:8059` | Next.js standalone server (the web app and `/api/complete`) |
| `querypad-collab` | `127.0.0.1:8061` | Yjs relay for live collaboration (`collab/server.mjs`) |

Put a reverse proxy in front that sends `/collab/` (with WebSocket upgrade headers) to the
relay and everything else to the app. Optional server-side AI keys go in `.env.server`
(for example `OPENROUTER_API_KEY=…`); they are read at runtime and never sent to browsers.
To use the AI CLIs signed in on the host instead of keys, set up the local AI bridge
([`local-ai/README.md`](local-ai/README.md)); compose mounts its socket folder into the app.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for runtime boundaries, state ownership,
loading, persistence, and validation, and [docs/DESIGN.md](docs/DESIGN.md) for UI conventions.

## Tech stack

| Area | Technology |
|------|-----------|
| Query engine | DuckDB-Wasm (web), `@duckdb/node-api` (CLI) |
| Framework | Next.js 16, React 19, TypeScript, Tailwind CSS v4 |
| Editor | Monaco |
| State | Zustand |
| Persistence | Server file store (`/api/store`) with live sync; IndexedDB fallback |
| Charts | Recharts |
| AI | Signed-in Claude / Codex / Grok / Cursor CLIs via the local bridge; Groq, Ollama Cloud, OpenRouter, xAI, Anthropic, OpenAI with keys |
| Collaboration | Yjs + y-websocket, self-hosted relay |

## Releases

Version numbers mark release milestones of this repository. See
[CHANGELOG.md](CHANGELOG.md) for release notes.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT

---

Originally created by [@vericontext](https://x.com/vericontext); the web edition is maintained
at [adminbjkai/querypad](https://github.com/adminbjkai/querypad).
