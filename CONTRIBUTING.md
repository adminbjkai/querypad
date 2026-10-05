# Contributing to QueryPad

Thanks for your interest in contributing to QueryPad!

## Development Setup

```bash
git clone https://github.com/vericontext/querypad.git
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
  app/             # Next.js app router pages + /api/complete (server-key AI proxy)
  components/      # React components (web app)
    ui/            # icons, primitives (buttons, Dialog, Menu, KindGlyph), Toaster
    workspace/     # shell: Header, CommandPalette, EmptyState, Splash
    editor/ results/ sidebar/ pipeline/ collaboration/ dropzone/ plugins/
  cli/             # querypad CLI: index.ts (dispatch), inspect.ts, ask.ts, explain.ts
  lib/
    discovery/     # engine-agnostic core: profile.ts, signals.ts, relationships.ts, …
    duckdb/        # browser DuckDB-Wasm: files.ts, queries.ts, browser-runner.ts
    duckdb-node/   # Node DuckDB: connection.ts, load.ts, profile.ts
    ai/            # streaming completions, providers, BYOK key storage
    collaboration/ # Yjs sync (tabs, per-tab text, files) over y-websocket
  stores/          # Zustand: workspace-store (data), ui-store (theme, panels, toasts)
  types/           # TypeScript type definitions (incl. discovery.ts)
collab/server.mjs  # self-hosted collaboration relay (plain Node ESM)
test/              # Node test runner specs for discovery, AI layer, collaboration
e2e/               # Playwright specs for the web app
fixtures/data/     # sample related files for CLI inspection
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

- Use [GitHub Issues](https://github.com/vericontext/querypad/issues)
- Include steps to reproduce, expected behavior, and actual behavior
- Screenshots are helpful for UI-related issues

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
