"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const GAP = 4;
const MARGIN = 8;

/**
 * Anchored floating card (DESIGN.md: 8px radius, `shadow-pop`): opens under its anchor, flips above
 * when there is no room, stays inside the viewport. Closes on outside pointerdown and Escape
 * (Escape returns focus to the anchor). Rendered through a portal so grids never clip it.
 */
export default function Popover({
  anchor,
  label,
  onClose,
  width = 300,
  align = "left",
  children,
}: {
  anchor: HTMLElement;
  label: string;
  onClose: () => void;
  width?: number;
  align?: "left" | "right";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const position = () => {
    const el = ref.current;
    if (!el) return;
    const a = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxHeight = vh - MARGIN * 2;
    el.style.maxHeight = `${maxHeight}px`;
    const h = Math.min(el.offsetHeight, maxHeight);
    const w = el.offsetWidth;
    const below = a.bottom + GAP;
    const above = a.top - GAP - h;
    const fitsBelow = below + h <= vh - MARGIN;
    let top = fitsBelow || above < MARGIN ? below : above;
    top = Math.min(Math.max(top, MARGIN), Math.max(MARGIN, vh - MARGIN - h));
    let left = align === "right" ? a.right - w : a.left;
    left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, vw - MARGIN - w));
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    el.style.visibility = "visible";
  };

  useLayoutEffect(() => {
    position();
  });

  useEffect(() => {
    const el = ref.current;
    if (el && !el.contains(document.activeElement)) {
      (el.querySelector<HTMLElement>("button, input, [tabindex]") ?? el).focus({ preventScroll: true });
    }
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        requestAnimationFrame(() => anchor.focus());
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

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      style={{ visibility: "hidden", width }}
      className="qp-pop fixed z-[70] flex max-w-[calc(100vw-16px)] flex-col overflow-y-auto rounded-lg border border-line bg-surface shadow-pop outline-none"
    >
      {children}
    </div>,
    document.body
  );
}
