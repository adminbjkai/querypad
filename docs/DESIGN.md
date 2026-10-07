# QueryPad design system

A light, labeled navigation frames a focused data workspace (Snowsight-like). Dense analysis
surfaces keep room for data; Home is spacious and AI-first: ask, then pick up where you left off.
All colors are semantic tokens in `src/app/globals.css` (light + dark); never hardcode hex.

## Surfaces
| Token | Use |
|---|---|
| `bg-paper` | page behind everything |
| `bg-chrome` | docked chrome: navigation, side panels, tab strips, panel headers, status bar, assistant |
| `bg-surface` | content: editor, results grid, cards, menus, dialogs |
| `bg-raised` | subtle fills inside content (zebra, code blocks, inputs at rest) |
| `bg-sunken` | hover / pressed fills |
| `border-line` / `border-line-strong` | 1px hairlines / emphasized borders |
Docked panels are square and divided by hairlines. Shadows (`shadow-pop`, `shadow-dialog`)
only on floating layers (menus, popovers, palette, dialogs).

## Type (Inter UI, JetBrains Mono for code/data)
- 11px/16 — section labels (the `SectionLabel` primitive: uppercase, tracking-wide, `text-faint`,
  font-medium, optional count pill), kbd chips, status bar
- 12px/16 — dense UI: explorer rows, grid cells (mono), chips, secondary text
- 13px/20 — default chrome: buttons, tabs, menu items, inputs
- 14px/20 — dialogs, assistant prose, empty-state titles (500)
- 16–30px — page headings (600, -0.01em)
Weights 400/500/600 only. `tabular-nums` on every number.

## Density (4px grid)
Navigation 228 wide (52 collapsed; always collapsed under 768px) · nav items 32 · page header 48 ·
sample-data banner 36 · side panel 264 · panel headers 40 · tab strips 36 · explorer rows 28 ·
grid rows 28 / header 32 (+56 for the header stats block, `DIST_HEIGHT`) · status bar 24.
Icons 16 (14 inline in dense rows).

## Radii & motion
4 (chips, small inputs) · 6 (buttons, menu items, inputs) · 8 (menus, cards, popovers) · 12 (dialogs).
Hover/color 120ms; menus & panels 160ms `var(--ease-out)`; respect reduced motion.

## States
Hover = one fill step (`bg-sunken`). Selected = `bg-accent-soft` + `text-ink`, or a 2px accent bar.
Navigation (Snowsight-like): Search + New ▾ (query, notebook, folder, pipeline, add data), then three groups —
Workspace: Home · Agent · SQL · Notebooks · Pipelines (pages); Data: Tables (page) · Joins (panel, badge =
joins still to review); Library: Folders (page) · Snippets · History (panels). The current item is a raised
white card (`bg-surface`, hairline ring, accent icon and edge bar); pages carry `aria-current="page"`, panel
toggles carry `aria-pressed`. The Tables side panel stays available beside SQL and Notebooks through the
page header's "Tables panel" toggle and ⌘B. Collapsed items show "Label (G X)" tooltips for the `g`-chords
(G H/A/S/N/P/T/F). Counts are a `bg-sunken` pill; collapsed, they become a 6px accent dot. A sorted grid column shows its header and arrow in `text-accent`.
Focus = `:focus-visible` 2px accent outline, offset 2. Disabled = 45% opacity.

## Patterns
- Confirmation for destructive actions is a small dialog with a `btn.danger` action (never a toast race).
- Empty state: 18px muted icon in a 36px rounded tile (`size-9 bg-raised`; the drop zone uses 20px on
  `bg-surface`), 14px/500 title, one 13px muted line, one primary action + kbd hint. Home's onboarding
  cards use a 40px `rounded-xl` tile with an 18px accent icon.
- Shortcut chips: `kbd` on neutral surfaces; `kbdOnAccent` inside a primary button (tinted with
  `on-accent`), e.g. the Run button's `⌘↵`.
- Dialogs: centered on the viewport (`items-center`), trap Tab focus, restore the opener on close,
  support Escape and bounded content scrolling.
- Menus: arrow keys, Home/End and Escape; initial focus on an enabled item. Entries are items,
  `"divider"` or `{ heading }` section labels (Export: Copy / Download / Plugins).
- Resize: pointer interaction plus keyboard adjustments and accessible values.
- Home: greeting, one composer that hands the question to the Assistant, suggestion chips, live
  catalog counts, Recent tabs (datasets, queries, snippets, spaces) and the semantic model — never
  decorative or fabricated statistics.
- Page header breadcrumbs: `Space › Tables`, `Space › Tables › name`, `Space › Notebooks › name`,
  `Space › Folders › name`, `Space › Agent`; the parent crumb returns to its list. Page actions sit before the
  space-wide ones (Collaborate, Share, Assistant): Tables → Add data; Notebooks → New notebook; Folders → New
  folder; Agent → none. Tables page = title, count, Add data, then the `DatasetList` (search, sort, Preview /
  Open / Profile per row) in a card, or an empty state with Add data.
- Table page: breadcrumb `Space › Tables › name` (the space crumb hides under 640px), a mono 22px title
  with the object icon, kind and source file, header actions (Query, Ask Assistant, Copy name), then
  Overview | Preview | Profile tabs (`role=tablist`, arrow keys). Overview = a name-filtered column
  table sorted by #, name or type (`aria-sort`) plus a "Table details" rail (`aside`, 280px on large
  screens); Preview = the results grid over the first 100 rows, no SQL tab; Profile = Row count and
  Columns stat tiles then the column cards.
- Explorer: pinned tables sit first under a "Pinned" label (pin glyph, remembered per space in local
  storage); hovering a row for ~400 ms or focusing it opens a 272px summary card beside the panel
  (`role="dialog"`, "name summary": shape, source, loaded time, keys, Open / Preview; Escape or leave
  closes; never on touch); searching keeps every match expanded with an accent "n of m columns" chip,
  `<mark>` on `bg-accent-soft`, "of total" after section counts, and a trailing "Ask the Assistant
  about …" row. Add data stages each file with an editable, validated table name before "Load".
- Sample-data banner: a 36px `bg-accent-soft` strip under the page header with an "Add data" action
  and a dismiss remembered per space — never a floating toast.
- Results header stats (toggle in the `#` header; on by default up to 50 columns, remembered): a
  histogram (numbers, dates) or a stacked top-values bar with the null share as a trailing marker, then
  two mono lines — min/max, the top value with its share and "+N more" (both values for a two-valued
  column), or true/false shares for booleans; bins and the block carry hover titles; click opens the
  column card.
- Results toolbar: the "N rows · N columns · N ms" meta is a button (`aria-label="Query details"`) opening
  a popover (rows, columns, a duration bar — "Total" only, DuckDB-Wasm reports no parse/execute split —
  "Ran at" and the SQL with Copy); an active grid sort is an accent `Chip` ("dept_name ASC" with a 14px
  × button, `aria-label="Clear sort"`); "Choose columns" (columns icon) opens a dialog with search,
  Select all and a checkbox per column — Apply hides unchecked columns in the grid and the exports;
  "✦ Next steps" opens a popover of up to three locally computed follow-ups (join a related table on
  the discovered key with its overlap, group a text column and count, profile the source table).
- Column card: a 300px popover anchored to the header stats block — name and type, the distribution
  (histogram) or top values with share bars and a "Show rows" chip per value (applies the grid filter),
  "NN% filled · NN% null", Distinct, Min/Max, Sum/Average for numbers, then "Keys & joins" rows in
  `text-join` when the column maps to a loaded table column (unique, referenced by, value overlap);
  "Open inspector" at the bottom opens the side pane (also in the column ⋮ menu as "Inspect column").
- Column ⋮ menu order: Copy column name · Hide/Show column stats · Sort ascending · Sort descending ·
  (Clear sort) · Select column · Copy column values · Inspect column.
- Selection footer: a header click selects the column and sorts by it; the footer reads "Count N"
  (plus Sum/Avg/Min/Max for numbers, Unique otherwise); a cell range reads "N cells" with the same stats.
- Assistant: user turns in soft right-aligned bubbles, replies as full-width prose, lookups as
  compact collapsible rows; a rounded composer with the model picker and a round send button;
  "All chats" lists every conversation in the space.
- Loading: `.qp-skeleton` blocks sized like the real content (never spinners for layout).
- Section label: the `SectionLabel` primitive (`text-[11px] font-medium uppercase tracking-wide
  text-faint`, optional count pill) — used by the explorer, Home and the table page; never a local copy.
