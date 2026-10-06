# QueryPad design system

A clear global masthead frames a focused data workspace. Dense analysis surfaces retain
room for data; Overview uses spacious cards to orient the user.
All colors are semantic tokens in `src/app/globals.css` (light + dark); never hardcode hex.

## Surfaces
| Token | Use |
|---|---|
| `bg-paper` | page behind everything |
| `bg-chrome` | docked chrome: activity rail, sidebars, tab strips, panel headers, status bar, assistant |
| `--masthead*` | global header background, text, field, borders and actions; scoped `.qp-*` classes |
| `bg-surface` | content: editor, results grid, cards, menus, dialogs |
| `bg-raised` | subtle fills inside content (zebra, code blocks, inputs at rest) |
| `bg-sunken` | hover / pressed fills |
| `border-line` / `border-line-strong` | 1px hairlines / emphasized borders |
Docked panels are square and divided by hairlines. Shadows (`shadow-pop`, `shadow-dialog`)
only on floating layers (menus, popovers, palette, dialogs).

## Type (Inter UI, JetBrains Mono for code/data)
- 11px/16 — section labels (uppercase, tracking-wide, `text-faint`, font-medium), kbd chips, status bar
- 12px/16 — dense UI: explorer rows, grid cells (mono), chips, secondary text
- 13px/20 — default chrome: buttons, tabs, menu items, inputs
- 14px/20 — dialogs, assistant prose, empty-state titles (500)
- 16–30px — page headings (600, -0.01em)
Weights 400/500/600 only. `tabular-nums` on every number.

## Density (4px grid)
Header 44 · activity rail 44 wide · tab strips & panel headers 36 · explorer rows 24 ·
grid rows 28 / header 32 · status bar 24. Icons 16 (14 inline in dense rows).

## Radii & motion
4 (chips, small inputs) · 6 (buttons, menu items, inputs) · 8 (menus, cards, popovers) · 12 (dialogs).
Hover/color 120ms; menus & panels 160ms `var(--ease-out)`; respect reduced motion.

## States
Hover = one fill step (`bg-sunken`). Selected = `bg-accent-soft` + `text-ink`, or a 2px accent bar.
Focus = `:focus-visible` 2px accent outline, offset 2. Disabled = 45% opacity.

## Patterns
- Empty state: 20px muted icon in a 36px rounded tile, 14px/500 title, one 13px muted line,
  one primary action + kbd hint.
- Dialogs: trap Tab focus, restore the opener on close, support Escape and bounded content scrolling.
- Menus: arrow keys, Home/End and Escape; initial focus on an enabled item.
- Resize: pointer interaction plus keyboard adjustments and accessible values.
- Overview: live catalog counts and semantic entities; never decorative or fabricated statistics.
- Loading: `.qp-skeleton` blocks sized like the real content (never spinners for layout).
- Section label: `text-[11px] font-medium uppercase tracking-wide text-faint`.
