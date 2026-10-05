# QueryPad

> **Cursor for Data — a local-first AI workspace that understands your datasets, not just runs SQL on them.**

QueryPad points an AI at a folder of CSV/Parquet/JSON files, profiles them,
discovers how they connect, and helps you analyze them with DuckDB — locally,
with no server-side data processing, no account, and no install.

The execution layer is solved (DuckDB does it well). The unsolved problem is that
**people don't understand their data**: which tables exist, what each field means,
how datasets connect, which join is correct. QueryPad is built to answer those
questions first, then generate and run the SQL.

<p align="center">
  <a href="https://querypad.io"><strong>Try the web app</strong></a> ·
  <a href="https://github.com/vericontext/querypad">Upstream project</a>
</p>

<p align="center">
  <video src="https://github.com/user-attachments/assets/5fa069e0-aaa2-4cc1-9735-df93b840f44d" width="100%" />
</p>

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
don't produce false positives.

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

The browser app is the same open-source code running client-side. DuckDB runs in your
tab (WebAssembly); your data stays on your machine unless you explicitly share or
collaborate.

- **Drop anything** — CSV, TSV, Parquet, JSON/NDJSON, Excel; several at once, then JOIN them
- **Understands before you ask** — every column is profiled (types, empties, distinct counts,
  ranges, top values) and joins between tables are inferred in the background
- **Verify the joins** — the Joins panel lists inferred relationships with confidence and a
  per-signal "why"; Accept / Reject / Edit them, or insert the `JOIN … ON …` clause directly
- **SQL with a real editor** — Monaco with table/column autocomplete; Ctrl/⌘+Enter runs the
  query, or only the selected part
- **AI that knows your joins** — Ctrl/⌘+K: describe the result, get streamed SQL built on the
  inferred relationships; "Fix with AI" on any failed query
- **Results you can work with** — sort by any column, filter rows, click a cell to copy,
  one-click charts, export to CSV / JSON / Markdown / HTML / Excel / Parquet / clipboard
- **Command palette** — Ctrl/⌘+P to run anything, jump to a tab, preview or profile a table,
  or reopen a past query
- **History** — your last 100 runs with row counts, timings and failures
- **Pipelines** — chain named SQL steps that build on each other, shown as a dependency graph
- **Live collaboration** — start a room, send the invite link, and edit the same tabs with
  shared cursors; small files sync to everyone
- **Share links** — compress data + query into one URL (no server involved); opening a link
  never overwrites your own workspace
- **Agent context** — copy schema, profiles, the current SQL and its results for Claude Code,
  Codex or any agent
- **Light and dark themes**, keyboard-first (press `?` for shortcuts), works on phones

<details>
<summary><strong>More web app details</strong></summary>

- **Persistence** — tables, tabs, pipelines and verdicts survive a refresh (IndexedDB)
- **Remote files** — load Parquet/CSV/JSON from any URL that allows cross-origin requests
- **Plugin system** — ES-module plugins can add visualizations, exporters and file loaders
- **Guardrails** — 100 MB per file, with a warning above 50 MB; results show the first
  10,000 rows (Parquet export writes them all)

</details>

### Keyboard shortcuts

| Action | Keys |
|--------|------|
| Run query (or the selection) | Ctrl/⌘ + Enter |
| Ask AI to write SQL | Ctrl/⌘ + K |
| Command palette | Ctrl/⌘ + P |
| Toggle sidebar | Ctrl/⌘ + B |
| Shortcut list | ? |

### AI providers

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
through `/api/complete` instead — the key never reaches the browser. The CLI reads the same
environment variables.

## Releases

QueryPad is a local-first tool, not a hosted SaaS. Version numbers mark GitHub
release milestones and public product updates. See [CHANGELOG.md](CHANGELOG.md)
for release notes.

## Contributing

Contributions are welcome! Feel free to open issues and pull requests. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT

---

Built by [@vericontext](https://x.com/vericontext)
