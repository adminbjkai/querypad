"use client";

import { memo, useState, type KeyboardEvent } from "react";
import type { NotebookCell as Cell } from "@/types/library";
import { Icon } from "@/components/ui/icons";
import { Kbd, MOD, Menu, Spinner, btn } from "@/components/ui/primitives";
import CellEditor from "./CellEditor";
import CellResult, { type CellRun } from "./CellResult";
import MarkdownCell from "./MarkdownCell";

export interface CellActions {
  onChange: (id: string, source: string) => void;
  onRun: (id: string, advance: boolean) => void;
  onAddAbove: (id: string) => void;
  onAddBelow: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onChangeKind: (id: string, kind: Cell["kind"]) => void;
  onDelete: (id: string) => void;
  onFocusSibling: (id: string, dir: -1 | 1) => void;
  onFocusCell: (id: string) => void;
}

const STATUS: Record<CellRun["status"], { label: string; className: string }> = {
  idle: { label: "Not run", className: "text-faint" },
  running: { label: "Running", className: "text-accent" },
  ok: { label: "Succeeded", className: "text-ok" },
  error: { label: "Failed", className: "text-danger" },
};

function StatusGlyph({ status }: { status: CellRun["status"] }) {
  const s = STATUS[status];
  if (status === "running") return <Spinner className={`size-3 ${s.className}`} />;
  return (
    <span aria-label={s.label} title={s.label} className={`inline-flex size-4 items-center justify-center ${s.className}`}>
      {status === "idle" ? <span className="size-1.5 rounded-full bg-current" /> : <Icon name={status === "ok" ? "check" : "alert"} size={14} />}
    </span>
  );
}

/**
 * One notebook cell: gutter (index, run status, actions menu), a SQL editor with its Run button
 * and result, or a Markdown block. The cell frame itself is focusable (`Cell N`), so keyboard
 * navigation and A/B/Enter work without entering the editor.
 */
export default memo(function NotebookCell({
  cell,
  index,
  count,
  run,
  autoFocus,
  actions,
  cellRef,
}: {
  cell: Cell;
  index: number;
  count: number;
  run: CellRun;
  /** Focus the editor as soon as it mounts (a freshly added cell). */
  autoFocus: boolean;
  actions: CellActions;
  cellRef: (id: string, el: HTMLElement | null) => void;
}) {
  const label = `Cell ${index + 1}`;
  const isSql = cell.kind === "sql";
  const [editing, setEditing] = useState(!isSql && cell.source === "");
  const [editorFocused, setEditorFocused] = useState(false);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    // Keys for the focused frame only — the editor and textarea handle their own.
    if (e.target !== e.currentTarget) return;
    const key = e.key;
    if (key === "ArrowDown" || key === "ArrowUp") {
      e.preventDefault();
      actions.onFocusSibling(cell.id, key === "ArrowDown" ? 1 : -1);
    } else if (key === "Enter" && (e.shiftKey || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (isSql) actions.onRun(cell.id, e.shiftKey);
    } else if (key === "Enter") {
      e.preventDefault();
      if (isSql) e.currentTarget.querySelector<HTMLElement>("textarea.inputarea")?.focus();
      else setEditing(true);
    } else if (key === "a" || key === "A") {
      e.preventDefault();
      actions.onAddAbove(cell.id);
    } else if (key === "b" || key === "B") {
      e.preventDefault();
      actions.onAddBelow(cell.id);
    }
  };

  return (
    <li className="list-none">
      <section
        ref={(el) => cellRef(cell.id, el)}
        tabIndex={0}
        aria-label={label}
        data-cell-id={cell.id}
        onKeyDown={onKeyDown}
        className={`group/cell flex rounded-lg border bg-surface transition-[border-color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
          editorFocused ? "border-accent shadow-sm" : "border-line hover:border-line-strong"
        }`}
      >
        {/* Gutter: index, status, actions. */}
        <div className="flex w-12 shrink-0 flex-col items-center gap-1.5 border-r border-line bg-chrome py-2">
          <span className="font-mono text-[11px] tabular-nums text-faint" aria-hidden="true">
            [{index + 1}]
          </span>
          <StatusGlyph status={run.status} />
          <div className="opacity-0 transition-opacity group-hover/cell:opacity-100 group-focus-within/cell:opacity-100">
            <Menu
              label={`${label} actions`}
              align="left"
              trigger={({ toggle }) => (
                <button onClick={toggle} className={btn.iconSm} aria-label={`${label} actions`} title="Cell actions">
                  <Icon name="more" size={14} />
                </button>
              )}
              items={[
                { label: "Add cell above", icon: "plus", hint: "A", onSelect: () => actions.onAddAbove(cell.id) },
                { label: "Add cell below", icon: "plus", hint: "B", onSelect: () => actions.onAddBelow(cell.id) },
                "divider",
                { label: "Move up", icon: "arrowUp", disabled: index === 0, onSelect: () => actions.onMove(cell.id, -1) },
                { label: "Move down", icon: "chevronDown", disabled: index === count - 1, onSelect: () => actions.onMove(cell.id, 1) },
                "divider",
                isSql
                  ? { label: "Change to text", icon: "edit", onSelect: () => actions.onChangeKind(cell.id, "markdown") }
                  : { label: "Change to SQL", icon: "code", onSelect: () => actions.onChangeKind(cell.id, "sql") },
                "divider",
                { label: "Delete cell", icon: "trash", danger: true, onSelect: () => actions.onDelete(cell.id) },
              ]}
            />
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-hidden rounded-r-lg">
          {isSql ? (
            <>
              <div className="flex h-8 items-center gap-2 border-b border-line bg-chrome px-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-faint">SQL</span>
                <span className="ml-auto hidden items-center gap-1.5 text-[11px] text-faint sm:flex">
                  <Kbd combo={["⇧", "↵"]} /> run & next
                </span>
                <button
                  onClick={() => actions.onRun(cell.id, false)}
                  disabled={run.status === "running" || !cell.source.trim()}
                  className={`${btn.ghost} h-6 px-1.5 text-[12px]`}
                  aria-label={`Run ${label.toLowerCase()}`}
                  title={`Run (${MOD}↵)`}
                >
                  <Icon name="play" size={14} />
                  Run
                </button>
              </div>
              <div onFocus={() => setEditorFocused(true)} onBlur={() => setEditorFocused(false)}>
                {/* Keyed by position: React moving a live Monaco editor's DOM node re-runs the wrapper's
                    effects against a disposed editor (React 19), so a reordered cell gets a fresh editor. */}
                <CellEditor
                  key={index}
                  value={cell.source}
                  label={`SQL for ${label.toLowerCase()}`}
                  autoFocus={autoFocus}
                  onChange={(v) => actions.onChange(cell.id, v)}
                  handlers={{
                    onRun: () => actions.onRun(cell.id, false),
                    onRunAndAdvance: () => actions.onRun(cell.id, true),
                    onEscape: () => actions.onFocusCell(cell.id),
                  }}
                />
              </div>
              <CellResult run={run} label={`Result of ${label.toLowerCase()}`} />
            </>
          ) : (
            <MarkdownCell
              value={cell.source}
              editing={editing}
              label={`Text for ${label.toLowerCase()}`}
              onChange={(v) => actions.onChange(cell.id, v)}
              onEdit={() => setEditing(true)}
              onDone={() => {
                setEditing(false);
                actions.onFocusCell(cell.id);
              }}
            />
          )}
        </div>
      </section>
    </li>
  );
});
