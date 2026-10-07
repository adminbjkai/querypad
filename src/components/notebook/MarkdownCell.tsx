"use client";

import { useEffect, useRef } from "react";
import Markdown from "@/components/assistant/Markdown";
import { btn } from "@/components/ui/primitives";

const renderCode = (lang: string, code: string, index: number) => (
  <pre key={index} className="overflow-x-auto rounded-md border border-line bg-raised p-2.5 font-mono text-[12px] leading-5 text-ink" data-lang={lang || undefined}>
    {code}
  </pre>
);

/** A text cell: rendered Markdown, or a plain textarea while editing (double-click, Edit, or Enter). */
export default function MarkdownCell({
  value,
  editing,
  label,
  onChange,
  onEdit,
  onDone,
}: {
  value: string;
  editing: boolean;
  label: string;
  onChange: (value: string) => void;
  onEdit: () => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <div className="bg-surface p-2">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" || (e.key === "Enter" && (e.shiftKey || e.metaKey || e.ctrlKey))) {
              e.preventDefault();
              e.stopPropagation();
              onDone();
            }
          }}
          aria-label={label}
          placeholder="Write notes in Markdown…"
          rows={Math.max(3, Math.min(20, value.split("\n").length + 1))}
          className="w-full resize-y rounded-md border border-line bg-raised px-2.5 py-2 text-[13px] leading-5 text-ink placeholder:text-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
        />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[11px] text-faint">Markdown · Shift+Enter to finish</span>
          <button onClick={onDone} className={btn.secondary} aria-label={`Done editing ${label.toLowerCase()}`}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/md relative bg-surface px-4 py-3" onDoubleClick={onEdit} title="Double-click to edit">
      {value.trim() ? (
        <Markdown text={value} renderCode={renderCode} />
      ) : (
        <p className="text-[13px] text-faint">Empty text cell — double-click to write.</p>
      )}
      <button
        onClick={onEdit}
        className={`${btn.ghost} absolute right-2 top-2 h-6 px-1.5 text-[12px] opacity-0 group-hover/md:opacity-100 focus-visible:opacity-100`}
        aria-label={`Edit ${label.toLowerCase()}`}
      >
        Edit
      </button>
    </div>
  );
}
