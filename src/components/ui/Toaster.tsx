"use client";

import { useUiStore } from "@/stores/ui-store";
import { Icon } from "./icons";

const TONE = {
  info: "border-line text-ink",
  success: "border-ok/40 text-ink",
  warning: "border-warn/50 text-ink",
  error: "border-danger/50 text-ink",
} as const;

const DOT = {
  info: "bg-accent",
  success: "bg-ok",
  warning: "bg-warn",
  error: "bg-danger",
} as const;

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
          className={`qp-pop pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-surface px-3 py-2.5 text-[13px] shadow-pop ${TONE[t.tone]}`}
        >
          <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${DOT[t.tone]}`} />
          <span className="flex-1 leading-5">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="text-faint hover:text-ink" aria-label="Dismiss">
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
