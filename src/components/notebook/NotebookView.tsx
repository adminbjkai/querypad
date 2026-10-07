"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast } from "@/stores/ui-store";
import type { Notebook, NotebookCell as Cell, NotebookCellKind } from "@/types/library";
import { addCellAfter, moveCell, newCell, removeCell, updateCell } from "@/lib/notebook/cells";
import { runCellSql } from "@/lib/notebook/run";
import { Icon } from "@/components/ui/icons";
import { Kbd, MOD, btn, kbdOnAccent } from "@/components/ui/primitives";
import NotebookCell, { type CellActions } from "./NotebookCell";
import { IDLE_RUN, type CellRun } from "./CellResult";

/** Typing is written to the store after this pause; structural edits are written at once. */
const SAVE_DEBOUNCE_MS = 300;

type Runs = Record<string, CellRun>;

/** Results are session-only, but survive leaving and reopening a notebook within the session. */
const sessionRuns = new Map<string, Runs>();

/** Mono 12px summary of an error for the Run-all toast. */
const firstLine = (message: string) => message.split("\n")[0].slice(0, 160);

export default function NotebookView({ notebook }: { notebook: Notebook }) {
  const updateNotebookCells = useWorkspaceStore((s) => s.updateNotebookCells);
  const renameNotebook = useWorkspaceStore((s) => s.renameNotebook);

  // Local cells: the store's list plus edits not yet flushed. A store change we did not push
  // ourselves (another device, undo) replaces the local copy.
  const [cells, setCellsState] = useState<Cell[]>(notebook.cells);
  const pushedRef = useRef(notebook.cells);
  const pendingRef = useRef<Cell[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest cells for callbacks that run after awaits (Run all) or from stable handlers.
  const cellsRef = useRef(notebook.cells);
  useEffect(() => {
    // An unflushed local edit wins over a concurrent remote change; it is written moments later.
    if (notebook.cells !== pushedRef.current && !pendingRef.current) {
      pushedRef.current = notebook.cells;
      cellsRef.current = notebook.cells;
      setCellsState(notebook.cells);
    }
  }, [notebook.cells]);

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    pushedRef.current = pending;
    updateNotebookCells(notebook.id, pending);
  }, [notebook.id, updateNotebookCells]);

  const commit = useCallback(
    (next: Cell[], immediate = false) => {
      cellsRef.current = next;
      setCellsState(next);
      pendingRef.current = next;
      if (immediate) {
        flush();
        return;
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush]
  );
  // Leaving the notebook writes whatever is still pending.
  useEffect(() => flush, [flush]);

  const [runs, setRuns] = useState<Runs>(() => sessionRuns.get(notebook.id) ?? {});
  const setRun = useCallback(
    (id: string, run: CellRun) =>
      setRuns((prev) => {
        const next = { ...prev, [id]: run };
        sessionRuns.set(notebook.id, next);
        return next;
      }),
    [notebook.id]
  );

  const cellEls = useRef(new Map<string, HTMLElement>());
  const cellRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) cellEls.current.set(id, el);
    else cellEls.current.delete(id);
  }, []);
  const focusCell = useCallback((id: string) => {
    const el = cellEls.current.get(id);
    if (el && document.activeElement !== el) el.focus();
  }, []);
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null);

  const runCell = useCallback(
    async (id: string): Promise<boolean> => {
      const cell = cellsRef.current.find((c) => c.id === id);
      if (!cell || cell.kind !== "sql" || !cell.source.trim()) return true;
      flush();
      setRun(id, { status: "running", result: null, error: null });
      try {
        const result = await runCellSql(cell.source);
        setRun(id, { status: "ok", result, error: null });
        return true;
      } catch (err) {
        setRun(id, { status: "error", result: null, error: err instanceof Error ? err.message : String(err) });
        return false;
      }
    },
    [flush, setRun]
  );

  const [runningAll, setRunningAll] = useState(false);
  const runAll = useCallback(async () => {
    if (runningAll) return;
    setRunningAll(true);
    try {
      const list = cellsRef.current;
      for (let i = 0; i < list.length; i++) {
        const cell = list[i];
        if (cell.kind !== "sql" || !cell.source.trim()) continue;
        const ok = await runCell(cell.id);
        if (!ok) {
          const error = sessionRuns.get(notebook.id)?.[cell.id]?.error ?? "";
          toast(`Run all stopped at cell ${i + 1}: ${firstLine(error)}`, "error");
          focusCell(cell.id);
          return;
        }
      }
    } finally {
      setRunningAll(false);
    }
  }, [focusCell, notebook.id, runCell, runningAll]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        void runAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runAll]);

  const addCell = useCallback(
    (kind: NotebookCellKind, afterId: string | null) => {
      const cell = newCell(kind);
      commit(addCellAfter(cellsRef.current, afterId, cell), true);
      // A new SQL cell focuses its editor on mount; a new text cell opens its textarea focused.
      setAutoFocusId(cell.id);
    },
    [commit]
  );

  const actions = useMemo<CellActions>(
    () => ({
      onChange: (id, source) => commit(updateCell(cellsRef.current, id, { source })),
      onRun: (id, advance) => {
        void runCell(id);
        if (!advance) return;
        const list = cellsRef.current;
        const i = list.findIndex((c) => c.id === id);
        if (i === -1) return;
        if (i + 1 < list.length) focusCell(list[i + 1].id);
        else addCell("sql", id);
      },
      onAddAbove: (id) => {
        const list = cellsRef.current;
        const i = list.findIndex((c) => c.id === id);
        addCell("sql", i <= 0 ? null : list[i - 1].id);
      },
      onAddBelow: (id) => addCell("sql", id),
      onMove: (id, dir) => {
        commit(moveCell(cellsRef.current, id, dir), true);
        requestAnimationFrame(() => focusCell(id));
      },
      onChangeKind: (id, kind) => commit(updateCell(cellsRef.current, id, { kind }), true),
      onDelete: (id) => {
        const list = cellsRef.current;
        const i = list.findIndex((c) => c.id === id);
        const next = removeCell(list, id);
        commit(next, true);
        const neighbour = next[Math.min(Math.max(i, 0), next.length - 1)];
        if (neighbour) requestAnimationFrame(() => focusCell(neighbour.id));
      },
      onFocusSibling: (id, dir) => {
        const list = cellsRef.current;
        const i = list.findIndex((c) => c.id === id);
        const target = list[i + dir];
        if (target) focusCell(target.id);
      },
      onFocusCell: focusCell,
    }),
    [addCell, commit, focusCell, runCell]
  );

  // Inline rename: click the title, Enter commits, Escape restores.
  const [renaming, setRenaming] = useState<string | null>(null);
  const commitRename = () => {
    const name = (renaming ?? "").trim();
    if (name) renameNotebook(notebook.id, name);
    setRenaming(null);
  };

  const sqlCount = cells.filter((c) => c.kind === "sql").length;

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto bg-paper">
      <div className="mx-auto w-full max-w-[1100px] px-5 pb-24 pt-5 sm:px-8">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Icon name="notebook" size={16} />
            </span>
            {renaming !== null ? (
              <input
                autoFocus
                value={renaming}
                onChange={(e) => setRenaming(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitRename();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setRenaming(null);
                  }
                }}
                aria-label="Notebook name"
                className="h-9 min-w-0 flex-1 rounded-md border border-accent bg-surface px-2 text-[20px] font-semibold tracking-[-0.01em] text-ink outline-none ring-2 ring-accent-soft"
              />
            ) : (
              <h1 className="min-w-0 truncate text-[20px] font-semibold leading-9 tracking-[-0.01em] text-ink">
                <button
                  onClick={() => setRenaming(notebook.name)}
                  className="max-w-full truncate rounded px-1 text-left hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  title="Rename notebook"
                >
                  {notebook.name}
                </button>
              </h1>
            )}
          </div>
          <span className="text-[12px] tabular-nums text-muted" aria-label="Cell count">
            {cells.length} {cells.length === 1 ? "cell" : "cells"}
            {sqlCount !== cells.length && <span className="text-faint"> · {sqlCount} SQL</span>}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => addCell("sql", cells[cells.length - 1]?.id ?? null)} className={btn.secondary} aria-label="Add SQL cell">
              <Icon name="code" size={14} />
              SQL cell
            </button>
            <button onClick={() => addCell("markdown", cells[cells.length - 1]?.id ?? null)} className={btn.secondary} aria-label="Add text cell">
              <Icon name="edit" size={14} />
              Text cell
            </button>
            <button onClick={() => void runAll()} disabled={runningAll || sqlCount === 0} className={btn.primary} aria-label="Run all" title={`Run all cells (${MOD}⇧↵)`}>
              <Icon name="play" size={14} />
              Run all
              <span className={`${kbdOnAccent} ml-0.5`} aria-hidden="true">{MOD} ⇧ ↵</span>
            </button>
          </div>
        </header>

        <ol className="mt-5 flex flex-col gap-3" aria-label="Cells">
          {cells.map((cell, i) => (
            <NotebookCell
              key={cell.id}
              cell={cell}
              index={i}
              count={cells.length}
              run={runs[cell.id] ?? IDLE_RUN}
              autoFocus={autoFocusId === cell.id}
              actions={actions}
              cellRef={cellRef}
            />
          ))}
        </ol>

        <div className="mt-3 flex items-center justify-center gap-2">
          <button onClick={() => addCell("sql", cells[cells.length - 1]?.id ?? null)} className={btn.ghost} aria-label="Add SQL cell at the end">
            <Icon name="plus" size={14} />
            SQL
          </button>
          <button onClick={() => addCell("markdown", cells[cells.length - 1]?.id ?? null)} className={btn.ghost} aria-label="Add text cell at the end">
            <Icon name="plus" size={14} />
            Text
          </button>
          <span className="ml-2 hidden items-center gap-1.5 text-[11px] text-faint md:flex">
            <Kbd combo={["⇧", "↵"]} /> run & next
            <span aria-hidden="true" className="mx-0.5">·</span>
            <Kbd>A</Kbd>/<Kbd>B</Kbd> add above/below
            <span aria-hidden="true" className="mx-0.5">·</span>
            <Kbd>Esc</Kbd> leave editor
          </span>
        </div>
      </div>
    </div>
  );
}
