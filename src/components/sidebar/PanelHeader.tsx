"use client";

import type { ReactNode } from "react";
import { useUiStore } from "@/stores/ui-store";
import { Icon } from "@/components/ui/icons";
import { Chip, btn } from "@/components/ui/primitives";

/** The title row every sidebar panel starts with (40px): title, a neutral count chip, then actions. */
export default function PanelHeader({ title, count, children }: { title: string; count?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-chrome px-3">
      <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
      {count !== undefined && <Chip className="tabular-nums">{count}</Chip>}
      <div className="ml-auto flex items-center gap-0.5">
        {children}
        {/* Phones show the panel as an overlay; give it an explicit way out. */}
        <button onClick={() => useUiStore.getState().setSidebarOpen(false)} className={`${btn.icon} md:hidden`} aria-label="Close panel" title="Close panel">
          <Icon name="x" size={16} />
        </button>
      </div>
    </div>
  );
}

/** Search field with a leading icon, shared by the explorer, history and snippets panels (same look as the `input` primitive). */
export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative px-3 pb-2.5 pt-2.5">
      <Icon name="search" size={14} className="pointer-events-none absolute left-5 top-[17px] text-faint" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && value && onChange("")}
        placeholder={placeholder}
        aria-label={label}
        className="h-8 w-full rounded-md border border-line bg-surface pl-7 pr-2.5 text-[13px] text-ink shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-faint hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent-soft"
      />
    </div>
  );
}
