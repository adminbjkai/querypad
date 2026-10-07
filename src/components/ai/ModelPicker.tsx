"use client";

import { useEffect, useRef, useState } from "react";
import { useAiStore, currentEffort } from "@/stores/ai-store";
import { AI_PROVIDER_OPTIONS, getAiProviderConfig, type AiProvider, type AiProviderConfig } from "@/lib/ai/providers";
import { getApiKey } from "@/lib/ai/api-key";
import { Icon } from "@/components/ui/icons";

/**
 * One model picker for every AI surface. Groups: CLIs signed in on this server (no key),
 * providers with a server key, and providers that need your own key. Models with a
 * reasoning-effort choice get a Low / Medium toggle.
 */
export default function ModelPicker({ align = "right", compact = false }: { align?: "left" | "right"; compact?: boolean }) {
  const provider = useAiStore((s) => s.provider);
  const serverProviders = useAiStore((s) => s.serverProviders);
  const setProvider = useAiStore((s) => s.setProvider);
  const setEffort = useAiStore((s) => s.setEffort);
  useAiStore((s) => s.efforts); // re-render when effort changes
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void useAiStore.getState().init();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const config = getAiProviderConfig(provider);
  const effort = currentEffort();
  // The default effort is implied; only a deliberate choice earns a suffix.
  const effortNote = effort && effort !== config.efforts?.[0] ? effort : undefined;
  const local = AI_PROVIDER_OPTIONS.filter((p) => p.kind === "local");
  const serverKeyed = AI_PROVIDER_OPTIONS.filter((p) => p.kind !== "local" && serverProviders.includes(p.id));
  const ownKey = AI_PROVIDER_OPTIONS.filter((p) => p.kind !== "local" && !serverProviders.includes(p.id));

  const option = (p: AiProviderConfig, note: string | null, disabled = false) => (
    <button
      key={p.id}
      role="menuitemradio"
      aria-checked={p.id === provider}
      disabled={disabled}
      onClick={() => {
        setProvider(p.id as AiProvider);
        if (!p.efforts?.length) setOpen(false);
      }}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] disabled:opacity-40 ${
        p.id === provider ? "bg-accent-soft text-ink" : "text-ink hover:bg-raised"
      }`}
    >
      <span className="w-[76px] shrink-0 truncate whitespace-nowrap text-[11px] font-medium text-muted">{p.vendor ?? p.label}</span>
      <span className="min-w-0 flex-1 truncate">{p.modelLabel}</span>
      {note && <span className="shrink-0 text-[11px] text-faint">{note}</span>}
      {p.id === provider && <Icon name="check" size={13} className="shrink-0 text-accent" />}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="AI model"
        aria-expanded={open}
        title="Choose the AI model"
        className="inline-flex h-7 max-w-[260px] items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-[12px] text-ink hover:border-line-strong hover:bg-raised"
      >
        <span className={`size-1.5 shrink-0 rounded-full ${serverProviders.includes(provider) || getApiKey(provider) ? "bg-ok" : "bg-warn"}`} />
        <span className="truncate">
          {!compact && <span className="text-muted">{config.vendor ?? config.label} · </span>}
          {config.modelLabel}
          {effortNote && <span className="text-muted"> · {effortNote}</span>}
        </span>
        <Icon name="chevronDown" size={12} className="shrink-0 text-faint" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="AI models"
          className={`qp-pop absolute top-full z-50 mt-1 w-[320px] rounded-xl border border-line bg-surface p-1.5 shadow-pop ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <p className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-faint">Signed in on this server · no key</p>
          {local.map((p) => option(p, serverProviders.includes(p.id) ? null : "unavailable", !serverProviders.includes(p.id)))}
          {serverKeyed.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-faint">Server API keys</p>
              {serverKeyed.map((p) => option(p, null))}
            </>
          )}
          <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-faint">Your API key</p>
          {ownKey.map((p) => option(p, getApiKey(p.id) ? "key saved" : "add key"))}

          {config.efforts && config.efforts.length > 0 && (
            <div className="mt-1.5 flex items-center justify-between border-t border-line px-2 pb-0.5 pt-2">
              <span className="text-[12px] text-muted">Effort</span>
              <div className="flex rounded-md bg-sunken p-0.5" role="radiogroup" aria-label="Reasoning effort">
                {config.efforts.map((e) => (
                  <button
                    key={e}
                    role="radio"
                    aria-checked={effort === e}
                    onClick={() => setEffort(provider, e)}
                    className={`h-6 rounded px-2.5 text-[12px] capitalize ${effort === e ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
