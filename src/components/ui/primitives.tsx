"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { classifyType } from "@/lib/duckdb/sql-utils";
import { isTopFocusScope, useFocusTrap } from "@/lib/hooks/use-focus-trap";
import type { ProfileColumnKind } from "@/types";
import { Icon, type IconName } from "./icons";

/** Shared button looks. Hierarchy: one primary action per area, quiet everything else. */
export const btn = {
  primary:
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap h-8 px-3 rounded-md bg-accent text-on-accent text-[13px] font-medium shadow-sm hover:bg-accent-hover active:translate-y-px disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-[background-color,transform,box-shadow]",
  danger:
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap h-8 px-3 rounded-md bg-danger text-on-accent text-[13px] font-medium shadow-sm hover:brightness-95 active:translate-y-px disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-[filter,transform]",
  secondary:
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap h-8 px-3 rounded-md border border-line bg-surface text-ink text-[13px] shadow-sm hover:border-line-strong hover:bg-raised active:translate-y-px disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-[background-color,border-color,transform]",
  ghost:
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap h-7 px-2 rounded-md text-muted text-[13px] hover:text-ink hover:bg-sunken disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-colors",
  icon:
    "inline-flex items-center justify-center size-7 rounded-md text-muted hover:text-ink hover:bg-sunken disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-colors",
};

export const input =
  "h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[13px] text-ink shadow-sm placeholder:text-faint outline-none hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent-soft transition-[border-color,box-shadow]";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.25rem] items-center justify-center rounded border border-line bg-raised px-1 font-sans text-[11px] leading-[18px] text-muted">
      {children}
    </kbd>
  );
}

export const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? "⌘" : "Ctrl";

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

export function Spinner({ className = "size-3.5" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden="true"
    />
  );
}

/** Centered modal with backdrop, Escape-to-close, and initial focus inside. */
export function Dialog({
  title,
  onClose,
  children,
  width = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-scrim p-3 pt-[8vh] sm:p-6 sm:pt-[10vh]"
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
          <h2 id={titleId} className="text-sm font-semibold text-ink">{title}</h2>
          <button data-close onClick={onClose} className={btn.icon} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-4">{children}</div>
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
  onSelect: () => void;
}

/** Small dropdown menu anchored to its trigger; closes on outside click and Escape. */
export function Menu({
  trigger,
  items,
  align = "right",
  side = "bottom",
  label,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: (MenuItem | "divider")[];
  align?: "left" | "right";
  /** Open below the trigger, or above it (for triggers near the bottom of the screen). */
  side?: "bottom" | "top";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("button, [role='button']")?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>("[role='menuitem']:not(:disabled)")?.focus();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const menuItems = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']:not(:disabled)") ?? []);
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
      {open && (
        <div
          role="menu"
          aria-label={label}
          ref={menuRef}
          onKeyDown={handleMenuKeyDown}
          className={`qp-pop absolute z-40 min-w-[200px] rounded-lg border border-line bg-surface p-1 shadow-pop ${
            side === "top" ? "bottom-full mb-1" : "top-full mt-1"
          } ${align === "right" ? "right-0" : "left-0"}`}
        >
          {items.map((item, i) =>
            item === "divider" ? (
              <div key={`d${i}`} className="my-1 h-px bg-line" />
            ) : (
              <button
                key={item.label}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  ref.current?.querySelector<HTMLElement>("button, [role='button']")?.focus();
                  setOpen(false);
                  item.onSelect();
                }}
                className={`flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-left text-[13px] disabled:opacity-40 ${
                  item.danger ? "text-danger hover:bg-danger-soft" : "text-ink hover:bg-raised"
                }`}
              >
                {item.icon && <Icon name={item.icon} className={item.danger ? "" : "text-muted"} />}
                <span className="flex-1">{item.label}</span>
                {item.hint && <span className="text-[11px] text-faint">{item.hint}</span>}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
