"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { classifyType } from "@/lib/duckdb/sql-utils";
import { isTopFocusScope, useFocusTrap } from "@/lib/hooks/use-focus-trap";
import type { ProfileColumnKind } from "@/types";
import { Icon, type IconName } from "./icons";

/** Shared button looks. Hierarchy: one primary action per area, quiet everything else. */
export const btn = {
  primary:
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap h-8 px-3 rounded-md bg-accent text-on-accent text-[13px] font-medium hover:bg-accent-hover active:translate-y-px disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-[background-color,transform,box-shadow]",
  danger:
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap h-8 px-3 rounded-md bg-danger text-on-accent text-[13px] font-medium hover:brightness-95 active:translate-y-px disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-[filter,transform]",
  secondary:
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap h-8 px-3 rounded-md border border-line bg-surface text-ink text-[13px] hover:border-line-strong hover:bg-raised active:translate-y-px disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-[background-color,border-color,transform]",
  ghost:
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap h-7 px-2 rounded-md text-muted text-[13px] hover:text-ink hover:bg-sunken disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-colors",
  /** Borderless 32px header/toolbar action: quiet until hovered; pair `aria-pressed` with `pressedTone`. */
  bar:
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap h-8 px-2.5 rounded-md text-muted text-[13px] hover:text-ink hover:bg-sunken disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-chrome transition-colors",
  icon:
    "inline-flex items-center justify-center size-7 rounded-md text-muted hover:text-ink hover:bg-sunken disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-colors",
  /** 24px icon button (14px icon) for `HoverTray`s inside 28px rows. */
  iconSm:
    "inline-flex items-center justify-center size-6 rounded-md text-muted hover:text-ink hover:bg-sunken disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-colors",
};

/** Classes for a toggled-on `btn.bar` (Assistant, Tables panel). */
export const pressedTone = "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent";

export const input =
  "h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[13px] text-ink placeholder:text-faint outline-none hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent-soft transition-[border-color,box-shadow]";

/**
 * Shortcut chip. A whole combination renders as ONE chip: `<Kbd combo={[MOD, "P"]} />` → "⌘ P"
 * (or `combo="⌘P"`). `children` still works for a single key.
 */
export function Kbd({ children, combo, className = "" }: { children?: ReactNode; combo?: string | string[]; className?: string }) {
  const text = Array.isArray(combo) ? combo.join(" ") : combo;
  return (
    <kbd
      className={`inline-flex min-w-[1.25rem] items-center justify-center whitespace-nowrap rounded border border-line-strong/60 bg-raised px-1 font-sans text-[11px] leading-[18px] text-muted ${className}`}
    >
      {text ?? children}
    </kbd>
  );
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? "⌘" : "Ctrl";

/** Shortcut chip for use inside an accent (primary) button: tinted with the button's own text color. */
export const kbdOnAccent =
  "inline-flex items-center rounded border border-on-accent/30 bg-on-accent/15 px-1 text-[11px] leading-4 text-on-accent";

const KIND_STYLE: Record<ProfileColumnKind, { glyph: string; className: string; label: string }> = {
  numeric: { glyph: "#", className: "text-k-num", label: "number" },
  text: { glyph: "Aa", className: "text-k-text", label: "text" },
  date: { glyph: "◷", className: "text-k-date", label: "date/time" },
  boolean: { glyph: "◐", className: "text-k-bool", label: "boolean" },
  other: { glyph: "{}", className: "text-k-other", label: "other" },
};

/** The column-kind mark used wherever a column appears (sidebar, results, profile). */
export function KindGlyph({ type, kind }: { type?: string; kind?: ProfileColumnKind }) {
  const resolved = kind ?? classifyType(type ?? "");
  const style = KIND_STYLE[resolved];
  return (
    <span
      className={`inline-flex w-5 shrink-0 justify-center font-mono text-[10px] font-semibold ${style.className}`}
      title={`${style.label}${type ? ` — ${type}` : ""}`}
      aria-label={style.label}
    >
      {style.glyph}
    </span>
  );
}

/** Sentence-case label over a group of items (DESIGN.md: 12px, semibold, muted), with an optional count pill. */
export function SectionLabel({
  children,
  count,
  as: Tag = "h2",
  className = "",
}: {
  children: ReactNode;
  count?: number;
  as?: "h2" | "h3" | "div";
  className?: string;
}) {
  return (
    <Tag className={`flex items-center gap-2 text-[12px] font-semibold leading-4 text-muted ${className}`}>
      <span>{children}</span>
      {count !== undefined && <span className="rounded-full bg-sunken px-1.5 py-0.5 text-[11px] font-medium leading-none tabular-nums text-faint">{count}</span>}
    </Tag>
  );
}

export function Spinner({ className = "size-3.5" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * Modal centered on the viewport (a fixed overlay, independent of the side panel and Assistant),
 * with backdrop, Escape-to-close, focus trap and focus restore to the opener.
 */
export function Dialog({
  title,
  onClose,
  children,
  footer,
  footerNote,
  width = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Actions rendered in a `DialogFooter` below the scrolling body (content scrolls under it). */
  footer?: ReactNode;
  /** Faint note shown at the left of `footer`. */
  footerNote?: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isTopFocusScope(ref.current)) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`qp-pop flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden ${width} rounded-xl border border-line bg-surface shadow-dialog sm:max-h-[calc(100dvh-3rem)]`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
          <h2 id={titleId} className="text-[14px] font-semibold text-ink">{title}</h2>
          <button data-close onClick={onClose} className={btn.icon} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-4">{children}</div>
        {footer !== undefined && (
          <DialogFooter className="shrink-0" note={footerNote}>
            {footer}
          </DialogFooter>
        )}
      </div>
    </div>
  );
}

export interface MenuItem {
  label: string;
  icon?: IconName;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  /** When set, the row is a `menuitemradio` showing a check mark (used by `Select`). */
  checked?: boolean;
  onSelect: () => void;
}

const MENU_ITEM_SELECTOR = "[role='menuitem']:not(:disabled), [role='menuitemradio']:not(:disabled)";

/** A menu row: an action, a divider, or a non-interactive section heading. */
export type MenuEntry = MenuItem | "divider" | { heading: string };

const MENU_GAP = 4;
const MENU_MARGIN = 8;

/**
 * Small dropdown menu anchored to its trigger. Rendered through a portal with `position: fixed`
 * (measured from the trigger), so it floats over scroll containers and dialogs instead of
 * stretching them; flips above when there is no room below and stays inside the viewport.
 * Closes on outside pointerdown, Escape and Tab (both keys return focus to the trigger).
 */
export function Menu({
  trigger,
  items,
  align = "right",
  side = "bottom",
  label,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: MenuEntry[];
  align?: "left" | "right";
  /** Open below the trigger, or above it (for triggers near the bottom of the screen). */
  side?: "bottom" | "top";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const focusTrigger = () => ref.current?.querySelector<HTMLElement>("button, [role='button']")?.focus();
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(focusTrigger);
  };

  // Positioning is a plain DOM write (no React state): measured from the trigger, flipped when
  // there is no room on the preferred side, clamped to the viewport with a margin.
  const position = () => {
    const anchor = ref.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    const a = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxHeight = vh - MENU_MARGIN * 2;
    menu.style.maxHeight = `${maxHeight}px`;
    const h = Math.min(menu.offsetHeight, maxHeight);
    const w = menu.offsetWidth;
    const below = a.bottom + MENU_GAP;
    const above = a.top - MENU_GAP - h;
    const fitsBelow = below + h <= vh - MENU_MARGIN;
    const fitsAbove = above >= MENU_MARGIN;
    let top = side === "top" ? (fitsAbove || !fitsBelow ? above : below) : fitsBelow || !fitsAbove ? below : above;
    top = Math.min(Math.max(top, MENU_MARGIN), Math.max(MENU_MARGIN, vh - MENU_MARGIN - h));
    let left = align === "right" ? a.right - w : a.left;
    left = Math.min(Math.max(left, MENU_MARGIN), Math.max(MENU_MARGIN, vw - MENU_MARGIN - w));
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.style.visibility = "visible";
  };

  useLayoutEffect(() => {
    if (open) position();
  });

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (menu && !menu.contains(document.activeElement)) menu.querySelector<HTMLElement>(MENU_ITEM_SELECTOR)?.focus();
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
      } else if (e.key === "Tab") {
        // Keep focus where it came from (inside a dialog, the trap defers to us while the menu is open).
        e.preventDefault();
        focusTrigger();
        close();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  });

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const menuItems = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR) ?? []);
    if (!menuItems.length) return;
    const current = menuItems.indexOf(document.activeElement as HTMLElement);
    let next = current;
    if (event.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % menuItems.length;
    else if (event.key === "ArrowUp") next = current < 0 ? menuItems.length - 1 : (current - 1 + menuItems.length) % menuItems.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = menuItems.length - 1;
    else return;
    event.preventDefault();
    menuItems[next].focus();
  };

  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open &&
        createPortal(
          <div
            role="menu"
            aria-label={label}
            ref={menuRef}
            style={{ visibility: "hidden" }}
            onKeyDown={handleMenuKeyDown}
            className="qp-pop fixed z-[70] min-w-[200px] overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-pop"
          >
            {items.map((item, i) =>
              item === "divider" ? (
                <div key={`d${i}`} className="my-1 h-px bg-line" />
              ) : "heading" in item ? (
                <div key={`h${i}`} role="presentation" className="px-2 pb-0.5 pt-1.5 text-[12px] font-semibold text-faint">
                  {item.heading}
                </div>
              ) : (
                <button
                  key={item.label}
                  role={item.checked === undefined ? "menuitem" : "menuitemradio"}
                  aria-checked={item.checked === undefined ? undefined : item.checked}
                  disabled={item.disabled}
                  onClick={() => {
                    focusTrigger();
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={`flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-left text-[13px] disabled:opacity-40 ${
                    item.danger ? "text-danger hover:bg-danger-soft" : "text-ink hover:bg-raised"
                  }`}
                >
                  {item.checked !== undefined && <Icon name="check" size={14} className={item.checked ? "text-accent" : "invisible"} />}
                  {item.icon && <Icon name={item.icon} className={item.danger ? "" : "text-muted"} />}
                  <span className="flex-1">{item.label}</span>
                  {item.hint && <span className="text-[11px] text-faint">{item.hint}</span>}
                </button>
              )
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

export type ChipTone = "neutral" | "accent" | "join" | "ok" | "warn" | "danger";

const CHIP_TONE: Record<ChipTone, string> = {
  neutral: "bg-sunken text-muted",
  accent: "bg-accent-soft text-accent",
  join: "bg-join-soft text-join",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
};

/** Small 20px status/count chip (DESIGN.md: 11px, medium). Tone = the semantic color pair it uses. */
export function Chip({ tone = "neutral", children, className = "" }: { tone?: ChipTone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium leading-none whitespace-nowrap ${CHIP_TONE[tone]} ${className}`}>
      {children}
    </span>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}

/** Segmented control (a radiogroup): a few mutually exclusive modes, e.g. SQL | Pipeline. Arrow keys move the selection. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = "md",
  className = "",
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const enabled = options.filter((o) => !o.disabled);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (!enabled.length) return;
    event.preventDefault();
    const current = enabled.findIndex((o) => o.value === value);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = enabled[(current + step + enabled.length) % enabled.length];
    onChange(next.value);
    (event.currentTarget.querySelector<HTMLElement>(`[data-value="${next.value}"]`))?.focus();
  };
  const sizing = size === "sm" ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-[12px]";
  return (
    <div role="radiogroup" aria-label={ariaLabel} onKeyDown={onKeyDown} className={`inline-flex rounded-md bg-raised p-0.5 ${className}`}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            data-value={option.value}
            tabIndex={selected ? 0 : -1}
            disabled={option.disabled}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center justify-center gap-1 whitespace-nowrap rounded font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none ${sizing} ${
              selected ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"
            } ${FOCUS_RING}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export interface TabItem {
  value: string;
  label: ReactNode;
  count?: number;
  disabled?: boolean;
}

/** Underline tabs for switching views within a page (36px strip, 2px accent underline). Arrow/Home/End keys move selection. */
export function Tabs({
  value,
  onChange,
  tabs,
  ariaLabel,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  tabs: TabItem[];
  ariaLabel: string;
  className?: string;
}) {
  const enabled = tabs.filter((t) => !t.disabled);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!enabled.length) return;
    const current = enabled.findIndex((t) => t.value === value);
    let next = -1;
    if (event.key === "ArrowRight") next = (current + 1) % enabled.length;
    else if (event.key === "ArrowLeft") next = (current - 1 + enabled.length) % enabled.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = enabled.length - 1;
    else return;
    event.preventDefault();
    onChange(enabled[next].value);
    (event.currentTarget.querySelector<HTMLElement>(`[data-value="${enabled[next].value}"]`))?.focus();
  };
  return (
    <div role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} className={`flex h-9 items-end gap-1 border-b border-line ${className}`}>
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            data-value={tab.value}
            tabIndex={selected ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.value)}
            className={`-mb-px inline-flex h-9 items-center gap-1.5 whitespace-nowrap border-b-2 px-2 text-[13px] font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none ${
              selected ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
            } ${FOCUS_RING}`}
          >
            {tab.label}
            {tab.count !== undefined && <Chip tone={selected ? "accent" : "neutral"}>{tab.count}</Chip>}
          </button>
        );
      })}
    </div>
  );
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

/**
 * Styled replacement for a native `<select>`: a `btn.secondary` trigger opening a `Menu` of
 * `menuitemradio` rows. Arrow Up/Down on the closed trigger change the value directly.
 */
export function Select<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = "md",
  className = "",
  align = "start",
}: {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
  align?: "start" | "end";
}) {
  const current = options.find((o) => o.value === value);
  const enabled = options.filter((o) => !o.disabled);
  const step = (delta: 1 | -1) => {
    if (!enabled.length) return;
    const i = enabled.findIndex((o) => o.value === value);
    onChange(enabled[(i + delta + enabled.length) % enabled.length].value);
  };
  return (
    <Menu
      label={ariaLabel}
      align={align === "end" ? "right" : "left"}
      items={options.map((o) => ({ label: o.label, checked: o.value === value, disabled: o.disabled, onSelect: () => onChange(o.value) }))}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={toggle}
          onKeyDown={(e) => {
            if (open) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              step(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              step(-1);
            }
          }}
          className={`${btn.secondary.replace("justify-center", "justify-between")} ${size === "sm" ? "h-7 px-2 text-[12px]" : ""} ${className}`}
        >
          <span className="min-w-0 truncate">{current?.label ?? value}</span>
          <Icon name="chevronDown" size={14} className="text-faint" />
        </button>
      )}
    />
  );
}

/** Dialog action row: actions right-aligned, an optional faint note on the left. */
export function DialogFooter({ children, note, className = "" }: { children: ReactNode; note?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-end gap-2 border-t border-line px-5 py-3 ${className}`}>
      {note !== undefined && <span className="mr-auto text-[12px] text-faint">{note}</span>}
      {children}
    </div>
  );
}

/**
 * Hover action tray for list rows (the row needs `group relative`): hidden until hover or focus
 * within. Children are `btn.iconSm` (24px) buttons with 14px icons.
 */
export function HoverTray({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-surface p-0.5 opacity-0 shadow-sm ring-1 ring-line group-hover:opacity-100 focus-within:opacity-100 ${className}`}
    >
      {children}
    </div>
  );
}
