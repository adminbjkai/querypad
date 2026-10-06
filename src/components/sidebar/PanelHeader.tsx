import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icons";

/** The title row every sidebar panel starts with: title, a quiet count, then actions. */
export default function PanelHeader({ title, count, children }: { title: string; count?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-chrome px-3">
      <h2 className="text-[11px] font-medium uppercase tracking-wide text-faint">{title}</h2>
      {count !== undefined && <span className="truncate text-[11px] tabular-nums text-muted">{count}</span>}
      <div className="ml-auto flex items-center gap-0.5">{children}</div>
    </div>
  );
}

/** Search field with a leading icon, shared by the explorer and history panels. */
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
    <div className="relative px-3 pb-2 pt-2">
      <Icon name="search" size={13} className="pointer-events-none absolute left-5 top-[15px] text-faint" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && value && onChange("")}
        placeholder={placeholder}
        aria-label={label}
        className="h-7 w-full rounded-md border border-line bg-surface pl-7 pr-2.5 text-[12px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent-soft"
      />
    </div>
  );
}
