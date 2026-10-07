import type { NotebookCell, NotebookCellKind } from "../../types/library";

/** Pure helpers for editing a notebook's cell list; every function returns a new array. */

export function newCell(kind: NotebookCellKind, source = ""): NotebookCell {
  return { id: crypto.randomUUID(), kind, source };
}

/** Insert `cell` after the cell with id `afterId` (at the start when null or unknown). */
export function addCellAfter(cells: NotebookCell[], afterId: string | null, cell: NotebookCell): NotebookCell[] {
  const index = afterId === null ? -1 : cells.findIndex((c) => c.id === afterId);
  return [...cells.slice(0, index + 1), cell, ...cells.slice(index + 1)];
}

/** Remove a cell; a notebook never has zero cells, so removing the last one leaves an empty SQL cell. */
export function removeCell(cells: NotebookCell[], id: string): NotebookCell[] {
  const next = cells.filter((c) => c.id !== id);
  return next.length > 0 ? next : [newCell("sql")];
}

/** Move a cell one place up (-1) or down (1); a no-op at either end or for an unknown id. */
export function moveCell(cells: NotebookCell[], id: string, dir: -1 | 1): NotebookCell[] {
  const index = cells.findIndex((c) => c.id === id);
  const target = index + dir;
  if (index === -1 || target < 0 || target >= cells.length) return cells;
  const next = [...cells];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function updateCell(
  cells: NotebookCell[],
  id: string,
  patch: Partial<Pick<NotebookCell, "source" | "kind">>
): NotebookCell[] {
  return cells.map((c) => (c.id === id ? { ...c, ...patch } : c));
}
