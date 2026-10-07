"use client";

import { useState } from "react";
import type { QueryResult } from "@/types";
import { Dialog, KindGlyph, btn, input } from "@/components/ui/primitives";

/** Pick which result columns the grid (and the exports) show; the choice lasts for this result. */
export default function ChooseColumnsDialog({
  result,
  hidden,
  onApply,
  onClose,
}: {
  result: QueryResult;
  hidden: string[];
  onApply: (hidden: string[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [checked, setChecked] = useState<Set<string>>(() => new Set(result.columns.filter((c) => !hidden.includes(c))));
  const q = search.trim().toLowerCase();
  const shown = result.columns.filter((c) => !q || c.toLowerCase().includes(q));
  const allShownChecked = shown.length > 0 && shown.every((c) => checked.has(c));

  const toggle = (column: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(column);
      else next.delete(column);
      return next;
    });
  const toggleAll = (on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      for (const c of shown) if (on) next.add(c);
      else next.delete(c);
      return next;
    });

  return (
    <Dialog
      title="Choose columns"
      onClose={onClose}
      footerNote={`${checked.size} of ${result.columns.length} shown`}
      footer={
        <>
          <button onClick={onClose} className={btn.ghost}>
            Cancel
          </button>
          <button
            onClick={() => onApply(result.columns.filter((c) => !checked.has(c)))}
            disabled={checked.size === 0}
            className={btn.primary}
          >
            Apply
          </button>
        </>
      }
    >
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search columns"
        aria-label="Search columns"
        className={input}
        autoFocus
      />
      <label className="mt-3 flex h-7 items-center gap-2 border-b border-line text-[12px] font-medium text-ink">
        <input
          type="checkbox"
          checked={allShownChecked}
          onChange={(e) => toggleAll(e.target.checked)}
          disabled={shown.length === 0}
          className="size-3.5 accent-accent"
        />
        Select all
      </label>
      <ul className="max-h-72 overflow-auto">
        {shown.map((column) => {
          const i = result.columns.indexOf(column);
          return (
            <li key={column}>
              <label className="flex h-7 items-center gap-2 rounded-md px-1 text-[12px] text-ink hover:bg-sunken">
                <input
                  type="checkbox"
                  checked={checked.has(column)}
                  onChange={(e) => toggle(column, e.target.checked)}
                  className="size-3.5 accent-accent"
                />
                <KindGlyph type={result.columnTypes[i]} />
                <span className="min-w-0 flex-1 truncate font-mono" title={column}>
                  {column}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-faint">{result.columnTypes[i]}</span>
              </label>
            </li>
          );
        })}
        {shown.length === 0 && <li className="py-2 text-[12px] text-muted">No column matches “{search}”.</li>}
      </ul>
    </Dialog>
  );
}
