# QueryPad design system

**The engineering pad.** QueryPad is a pad you work data out on, so the interface borrows from an
engineer's computation pad: sage graph-paper surfaces, graphite ink, one teal-ink accent for
action, and a highlighter for what you select. The memorable thing is in one place — Home's
schema map, drawn on graph paper — and everything around it stays quiet: hairlines, no gradient
washes, no shadows on docked chrome, sentence-case labels. Dense analysis surfaces keep room for
data. All colors are semantic tokens in `src/app/globals.css` (light + dark); never hardcode hex
(Monaco's themes in `src/lib/monaco-theme.ts` mirror the tokens because Monaco needs literals).

## Palette (light / dark)
| Token | Light | Dark | Role |
|---|---|---|---|
| `paper` | `#e9eee8` | `#0c110e` | page behind everything (sage) |
| `surface` | `#fbfcfa` | `#161e1a` | content |
| `ink` | `#16201a` | `#e5ebe6` | graphite text |
| `accent` | `#0e6b5f` | `#5ac6b2` | teal ink: primary actions, current item, focus |
| `mark` | `#eaf28f` | `#4b5216` | highlighter: text selection, editor selection, `<mark>` |
| `join` | `#8f5e00` | `#e2b443` | ochre: everything about joins |
| `grid` | `#dde4db` | `#25322b` | the major graph-paper rule |
Column kinds keep their own inks: numbers blue (`k-num`), text plum (`k-text`), dates rust
(`k-date`), booleans olive (`k-bool`). Charts cycle accent, join and the kind inks.

## Surfaces
| Token | Use |
|---|---|
| `bg-paper` | page behind everything |
| `bg-chrome` | docked chrome: navigation, side panels, tab strips, panel headers, status bar, assistant |
| `bg-surface` | content: editor, results grid, cards, menus, dialogs |
| `bg-raised` | subtle fills inside content (zebra, code blocks, inputs at rest) |
| `bg-sunken` | hover / pressed fills |
| `border-line` / `border-line-strong` | 1px hairlines / emphasized borders |
| `border-line-soft` | the quietest hairline: grid row and cell dividers, rules inside cards |
Docked panels are square and divided by hairlines. Shadows (`shadow-pop`, `shadow-dialog`)
only on floating layers (menus, popovers, palette, dialogs); buttons and inputs are flat. In dark
mode `--accent-soft` (`#163a33`) sits one visible step above `bg-sunken`, so selected rows,
sorted headers and chips read as a tint rather than a block. Graph paper (`.qp-graph`: a 12px
rule with a stronger line every 60px) appears only on canvases — the Home schema map, the
pipeline graph and the drop overlay.

## Type (Instrument Sans UI, IBM Plex Mono for code/data)
- `.qp-display` — page and space titles: Instrument Sans at 600, narrowed on its width axis
  (`wdth` 80), -0.015em; the space name on Home is 40px, page titles 30px. Table names stay mono.
- 11px/16 — kbd chips, count pills, status bar
- 12px/16 — section labels (the `SectionLabel` primitive: sentence case, semibold, `text-muted`,
  optional count pill), dense UI: explorer rows, grid cells (mono), chips, secondary text
- 13px/20 — default chrome: buttons, tabs, menu items, inputs
- 14px/20 — dialogs, assistant prose, empty-state titles (500)
- 15–20px — section headings and stat values (600)
- Markdown headings (assistant replies, Agent turns, notebook text cells): h1 16, h2 15, h3 14,
  h4 13, all 600 on 20px lines, rendered as real `h1`–`h4`
Weights 400/500/600 only. `tabular-nums` on every number.

## Density (4px grid)
Navigation 228 wide (52 collapsed; always collapsed under 768px) · nav items 32 · page header 48 ·
sample-data banner 36 · side panel 264 · panel headers 40 · tab strips 36 · explorer rows 28 ·
grid rows 28 / header 32 (+56 for the header stats block, `DIST_HEIGHT`) · status bar 24 ·
library and notebook list rows 36 · notebook cell gutter 48 wide.
Icons 16 (14 inline in dense rows and in 24px `btn.iconSm` buttons); the old 13/15px sizes are gone.

## Primitives (`src/components/ui/primitives.tsx`)
Every control below exists once; pages compose them rather than restyling raw elements.
- `btn.primary` / `btn.danger` / `btn.secondary` (32px) · `btn.ghost` (28px) · `btn.icon` (28px, 16px icon)
  · `btn.iconSm` (24px, 14px icon, for hover trays in 28px rows); `input` (32px).
- `Kbd` — one chip per combination: `<Kbd combo={[MOD, "P"]} />` renders "⌘ P"; `kbdOnAccent` is the
  tinted variant inside a primary button.
- `Chip` — 20px, 11px/500, tone = `neutral | accent | join | ok | warn | danger` (step kinds, counts,
  sort state, file status).
- `Segmented` — a `radiogroup` of a few modes (Ask | Auto, All | Succeeded | Failed, effort), arrow keys
  move the selection; `sm` is 20px, `md` 24px.
- `Tabs` — a 36px `tablist` with a 2px accent underline and optional count chips (results Table | Chart |
  Details, Home's Recent, Add data Files | From URL, the table page); Arrow/Home/End move selection.
- `Select` — the styled replacement for a native `<select>`: a `btn.secondary` trigger opening a `Menu` of
  `menuitemradio` rows (chart settings, join editor, catalog sort, snippet folder); Arrow keys on the
  closed trigger step the value. No native selects remain in the app.
- `Menu` — rendered through a portal with `position: fixed`, measured from the trigger, flipped above
  when there is no room below and clamped to the viewport, so it never stretches a scroll container or a
  dialog. Entries are items, `"divider"` or `{ heading }`; Escape and Tab close it and refocus the trigger
  (the dialog focus trap defers to an open menu).
- `Dialog` — centered, focus-trapped; `footer` renders a `DialogFooter` (actions right-aligned, optional
  `footerNote` on the left) that stays put while the body scrolls.
- `HoverTray` — the action tray for list rows (`group relative` parent): hidden until hover or focus
  within, holding `btn.iconSm` buttons (explorer rows, snippets, history, library rows, chat lists).
- `SectionLabel`, `KindGlyph`, `Spinner` as before.

## Radii & motion
4 (chips, small inputs) · 6 (buttons, menu items, inputs) · 8 (menus, cards, popovers) · 12 (dialogs).
Hover/color 120ms; menus & panels 160ms `var(--ease-out)`; respect reduced motion.

## States
Hover = one fill step (`bg-sunken`). Selected = `bg-accent-soft` + `text-ink`, or a 2px accent bar.
Navigation: a full-width Search box (⌘P) and a full-width "New query ▾" split, then three groups —
Workspace: Home · Agent · SQL · Notebooks · Pipelines (pages); Data: Tables (page) · Joins (panel, badge =
joins still to review); Library: Folders (page) · Snippets · History (panels). The current page is an
`bg-accent-soft` row with an accent icon; an open panel is a `bg-sunken` row; pages carry
`aria-current="page"`, panel toggles carry `aria-pressed`. The Tables side panel stays available beside SQL and Notebooks through the
page header's "Tables panel" toggle and ⌘B. Page items carry "Label (G X)" tooltips for the `g`-chords
(G H/A/S/N/P/T/F); exactly one item is lit at a time (a table page lights Tables). Above the groups sit the
Search box (⌘P) and the New split control — the accent "New query" half starts a query, the chevron half opens
the menu (query, visual query, notebook, folder, pipeline, add data); collapsed, both become one `+` icon
button. Counts are plain faint numbers (accent on the current item) while the rail is open. Collapsed, those pills hide; Joins keeps a 6px accent dot while
joins are still waiting for a verdict. A sorted grid column shows its header and arrow
in `text-accent`.
Focus = `:focus-visible` 2px accent outline, offset 2. Disabled = 45% opacity.

## Patterns
- Confirmation for destructive actions is a small dialog with a `btn.danger` action (never a toast race).
- Empty state: 18px muted icon in a 36px rounded tile (`size-9 bg-raised`; the drop zone uses 20px on
  `bg-surface`), 14px/500 title, one 13px muted line, one primary action ("Create a notebook",
  "Create a folder"). Radii: 4 chips · 6 controls · 8 cards and popovers · 12 dialogs.
- Header actions: page actions (Add data, New notebook, New folder) are `btn.secondary`; space-wide
  actions (Tables panel, Collaborate, Share, Assistant) are borderless `btn.bar`, toggled ones add
  `pressedTone`.
- Shortcut chips: `kbd` on neutral surfaces; `kbdOnAccent` inside a primary button (tinted with
  `on-accent`), e.g. the Run button's `⌘↵`.
- Dialogs: centered on the viewport (`items-center`), trap Tab focus, restore the opener on close,
  support Escape and bounded content scrolling.
- Menus: arrow keys, Home/End and Escape; initial focus on an enabled item. Entries are items,
  `"divider"` or `{ heading }` section labels (Export: Copy / Download / Plugins).
- Resize: pointer interaction plus keyboard adjustments and accessible values.
- Home: a left-aligned header — greeting, the space name as the `h1` in `.qp-display`, Add data and
  Copy context — then the live counts (Tables, Rows, Joins with how many wait for review, Profiled),
  then the **schema map**: every table and view (up to 24) as a card on graph paper (mono name, row
  count, a column-kind strip), laid out left to right so a table sits one column left of what it
  references, joined by ochre curves — solid when accepted, dashed while unreviewed — labelled with
  the join column. A card opens the table page; a join label opens a new tab joining the two tables
  and runs it; "Review N joins" opens the Joins panel. Below: "What do you want to know?" with the
  composer and suggestion chips, "Start something" (four quick actions), Recent tabs and the
  business entities — never decorative or fabricated statistics.
- Page header breadcrumbs: `Space › Tables`, `Space › Tables › name`, `Space › Notebooks › name`,
  `Space › Folders › name`, `Space › Agent`; the parent crumb returns to its list. Page actions sit before the
  space-wide ones (Collaborate, Share, Assistant): Tables → Add data; Notebooks → New notebook; Folders → New
  folder; Agent → none. Those New buttons live only in the header — the list pages do not repeat them.
  Tables page = title, count ("N tables" / "N views", never "datasets"), Add data, then the `DatasetList`
  (search "tables or columns", sort, Preview / Open / Profile per row) in a card, or an empty state with Add data.
  Home's catalog keeps the word "datasets".
- SQL worksheet: the tab strip goes straight into the editor (no context row). The Visual Query Designer toggle is an icon button in the editor toolbar ("Visual query designer", `aria-pressed`, `Mod+Shift+V`).
- Visual Query Designer: replaces the editor pane while open. Tables are added from an "Add table" menu and laid out left to right; each later table joins onto an earlier one through a discovered relationship, else a column name both share (`*_id` first), else it stays unjoined ("Not joined yet") until the user picks both join columns. Join type (`INNER`, `LEFT`, `RIGHT`) and columns use `Select`. A column name checked in two tables is aliased `<table>_<column>`. "Use in editor" fills an empty tab, or opens a new tab when the current one holds other SQL.
- Chart settings: the chart type is a radiogroup of seven 32px pictograms (bar, horizontal bar, line,
  area, scatter, pie, scorecard; arrow keys move the choice, the selected one is accent-outlined); the
  other settings use `Select`.
- Results toolbar wraps onto a second line on a narrow worksheet so Table / Chart / Details and the
  row actions (filter, columns, inspector, next steps, export) stay on screen.
- Table page: breadcrumb `Space › Tables › name` (the space crumb hides under 640px), a mono 22px title
  with the object icon, kind and source file, header actions (Query, Ask Assistant, Copy name), then
  Overview | Preview | Profile tabs (`role=tablist`, arrow keys). Overview = a name-filtered column
  table sorted by #, name or type (`aria-sort`; the type is the DuckDB type name as DuckDB reports it) plus a "Table details" rail (`aside`, 280px on large
  screens); Preview = the results grid over the first 100 rows, no SQL tab; Profile = Row count and
  Columns stat tiles then the column cards.
- Tables panel (the explorer, "Database Explorer" style): header "Tables" + count chip, Refresh (re-reads the
  catalog), Add data (once data exists) and a ⋯ menu (Add data…, Expand all, Collapse all, Profile all); an
  `Objects | Sources` `Segmented` (Sources lists loaded files, their resulting table, and unrestored ones
  flagged); a search ("Search tables and columns") and a Filter ▾ menu (Tables, Views, With joins, Profiled)
  whose active filters show as removable chips. Objects is a `role="tree"` (arrows, Home/End, Left/Right
  collapse and expand, Enter opens the table page, Space selects): space (database icon) → "Tables N" /
  "Views N" groups (collapse state remembered per space) → 28px rows (icon, mono name, pin glyph for pinned
  tables, which sort first). Hovering ~400 ms or focusing a row opens the 272px summary card beside the panel
  (`role="dialog"`, "name summary"; Escape or leave closes; never on touch). Selecting a row opens a bottom
  details pane (~45% of the body, `role="separator"` "Resize details" — drag or Up/Down keys, remembered):
  mono name, row count, ⋯ (Open table page, Preview, Profile, Copy name, Insert name, Remove) and ×, then 24px
  column rows (kind glyph, mono name, full DuckDB type faint at the right, key/join marks); clicking
  a column inserts it at the editor cursor. Each table and view with columns has a chevron (Show columns /
  Hide columns); expanding lists every column with its DuckDB type and key mark, and ArrowRight /
  ArrowLeft expand and collapse that row. While searching, matches stay expanded on their own (accent
  "n of m columns" chip, `<mark>` in the highlighter (`--mark`), "of total" on group counts, trailing "Ask the Assistant
  about …" row) and the chevron is not a second control. Add data stages each file with an editable, validated table name before "Load".
- Sample-data banner: a 36px `bg-raised` strip under the page header ("These are two sample tables…")
  with a "Use my own data" action and a dismiss remembered per space — never a floating toast.
- Toasts: one icon and color per tone (info accent, success ok, warning warn, error danger) on a
  `bg-surface` card with a hairline ring; the same message again extends the existing toast instead of
  stacking, and at most three show (errors stay 8 s, others 4 s).
- Agent page: a 260px session column (New chat, search, "All chats" with hover-tray delete) beside a
  880px thread. User turns are soft right-aligned bubbles; the Agent's prose is 14px; a plan is a card —
  prose, a summary row with a step-count `Chip`, numbered steps (status glyph, title, Read / Write / Danger
  chip in neutral / accent / danger tone, outcome) that expand to their SQL (Copy, Open in SQL), result grid
  or error with "Fix and retry". The step waiting for approval is tinted `bg-accent-soft/40` with Run /
  Skip / Run all remaining; a danger step's Run is `btn.danger` and opens a confirmation dialog ("There is
  no undo."). The footer's "Run plan" / "Continue plan" carries `⌘ ↵`. The summary card lists Objects as
  table links, Keys chosen in `text-join`, and follow-up pills. The composer is a rounded box with an
  "Add context" (+) menu of tables, an Ask | Auto `Segmented` approvals control, a Plan toggle (warn tint
  when on), the model picker and a send button that becomes Cancel while busy. With no messages the
  thread shows "What should we build?", the three-step sequence (Plan, Approve, Review) and a list of
  prompts to try.
- Notebook: a 1100px column; cells are `bg-surface` cards with a 48px `bg-chrome` gutter (`[n]`, status
  glyph, actions menu), an accent border while the editor has focus, and the frame itself is focusable
  (`Cell N`) so ↑/↓, Enter, A/B and Shift+Enter work without entering Monaco. SQL cells carry a 32px
  strip ("SQL", `⇧ ↵ run & next`, Run) over a 3–20 line editor and a result region capped at 320px;
  text cells render Markdown and edit in a textarea (double-click, Edit, Enter; Shift+Enter or Escape to
  finish). The header holds the inline-renamable title, the cell count, SQL cell / Text cell and a
  primary Run all with `⌘ ⇧ ↵`.
- Library (Folders page): folder cards in a 3-column grid, an "Unfiled" section, and 36px `LibraryRow`s
  (icon, name, Query / Notebook chip, folder, updated) with a hover tray Open · Rename · Move · Delete;
  saved tabs show a filled accent bookmark and a warn dot for unsaved changes; destructive actions
  confirm in a dialog.
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
- Column card: a 300px popover anchored to the header stats block — name and DuckDB type, the distribution
  (histogram) or top values with share bars and a "Show rows" chip per value (applies the grid filter),
  "NN% filled · NN% null", Distinct, Min/Max, Sum/Average for numbers, then "Keys & joins" rows in
  `text-join` when the column maps to a loaded table column (unique, referenced by, value overlap);
  "Open inspector" at the bottom opens the side pane (also in the column ⋮ menu as "Inspect column").
- Column ⋮ menu order: Copy column name · Hide/Show column stats · Sort ascending · Sort descending ·
  (Clear sort) · Select column · Copy column values · Inspect column.
- Selection footer: a header click selects the column and sorts by it; the footer reads "Count N"
  (plus Sum/Avg/Min/Max for numbers, Unique otherwise); a cell range reads "N cells" with the same stats.
- Assistant: user turns in soft right-aligned bubbles, replies as full-width prose, lookups as
  compact collapsible rows; a composer with the model picker and a send button;
  "All chats" lists every conversation in the space.
- Loading: `.qp-skeleton` blocks sized like the real content (never spinners for layout).
- Section label: the `SectionLabel` primitive (`text-[12px] font-semibold text-muted`, sentence
  case, optional count pill) — used by the explorer, Home and the table page; never a local copy.
