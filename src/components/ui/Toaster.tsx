"use client";

import { useUiStore } from "@/stores/ui-store";
import { Icon, type IconName } from "./icons";

/** One icon + color per kind, all from semantic tokens. */
const KIND: Record<"info" | "success" | "warning" | "error", { icon: IconName; className: string }> = {
  info: { icon: "info", className: "text-accent" },
  success: { icon: "check", className: "text-ok" },
  warning: { icon: "alert", className: "text-warn" },
  error: { icon: "alert", className: "text-danger" },
};

export default function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className="qp-pop pointer-events-auto flex items-start gap-2.5 rounded-lg bg-surface px-3 py-2.5 text-[13px] text-ink shadow-pop ring-1 ring-line"
        >
          <Icon name={KIND[t.tone].icon} size={16} className={`mt-0.5 ${KIND[t.tone].className}`} />
          <span className="flex-1 leading-5">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="-mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-faint hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Dismiss"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
