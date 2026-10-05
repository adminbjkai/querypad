"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { classifyType } from "@/lib/duckdb/sql-utils";
import type { ProfileColumnKind } from "@/types";
import { Icon, type IconName } from "./icons";

/** Shared button looks. Hierarchy: one primary action per area, quiet everything else. */
export const btn = {
  primary:
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap h-8 px-3 rounded-md bg-accent text-on-accent text-[13px] font-medium hover:bg-accent-hover disabled:opacity-45 disabled:pointer-events-none transition-colors",
  secondary:
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap h-8 px-3 rounded-md border border-line bg-surface text-ink text-[13px] hover:border-line-strong hover:bg-raised disabled:opacity-45 disabled:pointer-events-none transition-colors",
  ghost:
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap h-7 px-2 rounded-md text-muted text-[13px] hover:text-ink hover:bg-sunken disabled:opacity-40 disabled:pointer-events-none transition-colors",
  icon:
    "inline-flex items-center justify-center size-7 rounded-md text-muted hover:text-ink hover:bg-sunken disabled:opacity-40 disabled:pointer-events-none transition-colors",
};

export const input =
  "h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[13px] text-ink placeholder:text-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-colors";

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const focusable = ref.current?.querySelector<HTMLElement>("input, button:not([data-close]), select, textarea");
    focusable?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-scrim p-4 pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`qp-pop w-full ${width} rounded-xl border border-line bg-surface shadow-pop`}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <button data-close onClick={onClose} className={btn.icon} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="p-4">{children}</div>
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
  label,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: (MenuItem | "divider")[];
  align?: "left" | "right";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={`qp-pop absolute top-full z-40 mt-1 min-w-[200px] rounded-lg border border-line bg-surface p-1 shadow-pop ${
            align === "right" ? "right-0" : "left-0"
          }`}
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
                  setOpen(false);
                  item.onSelect();
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] disabled:opacity-40 ${
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
