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
Navigation: the current item is a raised white card (`bg-surface`, hairline ring, accent icon and edge bar);
pages carry `aria-current="page"`, panel toggles carry `aria-pressed`. Counts are a `bg-sunken` pill;
collapsed, they become a 6px accent dot. A sorted grid column shows its header and arrow in `text-accent`.
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
- Table page: breadcrumb `Space › Tables › name` (the space crumb hides under 640px), a mono 22px title
  with the object icon, kind and source file, header actions (Query, Ask Assistant, Copy name), then
  Overview | Preview | Profile tabs (`role=tablist`, arrow keys). Overview = a name-filtered column
  table sorted by #, name or type (`aria-sort`) plus a "Table details" rail (`aside`, 280px on large
  screens); Preview = the results grid over the first 100 rows, no SQL tab; Profile = Row count and
  Columns stat tiles then the column cards.
- Sample-data banner: a 36px `bg-accent-soft` strip under the page header with an "Add data" action
  and a dismiss remembered per space — never a floating toast.
- Results header stats (toggle in the `#` header; on by default up to 50 columns, remembered): a
  histogram (numbers, dates) or a stacked top-values bar with the null share as a trailing marker, then
  two mono lines — min/max, the top value with its share and "+N more" (both values for a two-valued
  column), or true/false shares for booleans; bins and the block carry hover titles; click opens the
  column inspector.
- Assistant: user turns in soft right-aligned bubbles, replies as full-width prose, lookups as
  compact collapsible rows; a rounded composer with the model picker and a round send button;
  "All chats" lists every conversation in the space.
- Loading: `.qp-skeleton` blocks sized like the real content (never spinners for layout).
- Section label: the `SectionLabel` primitive (`text-[11px] font-medium uppercase tracking-wide
  text-faint`, optional count pill) — used by the explorer, Home and the table page; never a local copy.
