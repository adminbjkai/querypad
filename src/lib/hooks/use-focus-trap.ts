"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const focusScopes: HTMLElement[] = [];

/** Nested overlays leave keyboard handling to the most recently opened scope. */
export function isTopFocusScope(container: HTMLElement | null): boolean {
  return focusScopes.at(-1) === container;
}

/** Keep keyboard focus inside an active dialog and return it to its opener on close. */
export function useFocusTrap<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  active = true,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!active) return;

    const container = containerRef.current;
    if (!container) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) => element.getAttribute("aria-hidden") !== "true" && element.offsetParent !== null,
    );

    focusScopes.push(container);
    (initialFocusRef?.current ?? focusables().find((el) => !el.hasAttribute("data-close")) ?? focusables()[0] ?? container).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !isTopFocusScope(container)) return;
      const elements = focusables();
      if (!elements.length) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const wasTop = isTopFocusScope(container);
      const index = focusScopes.indexOf(container);
      if (index !== -1) focusScopes.splice(index, 1);
      if (wasTop && previous?.isConnected) previous.focus();
    };
  }, [active, containerRef, initialFocusRef]);
}
