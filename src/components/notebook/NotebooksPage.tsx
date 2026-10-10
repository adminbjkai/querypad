"use client";

import { useMemo, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import type { Notebook } from "@/types/library";
import { relativeTime } from "@/components/home/format";
import { Icon } from "@/components/ui/icons";
import { Chip, Dialog, HoverTray, btn, input } from "@/components/ui/primitives";
import NotebookView from "./NotebookView";
import { startNotebook } from "@/components/workspace/NavRail";

const cellsLabel = (n: number) => `${n} ${n === 1 ? "cell" : "cells"}`;

function NotebookRow({
  notebook,
  folderName,
  renaming,
  onOpen,
  onRenameStart,
  onRenameEnd,
  onDelete,
}: {
  notebook: Notebook;
  folderName: string | null;
  renaming: boolean;
  onOpen: () => void;
  onRenameStart: () => void;
  onRenameEnd: (name: string | null) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(notebook.name);
  return (
    <li className="group relative border-b border-line last:border-0">
      {renaming ? (
        <div className="flex h-9 items-center gap-2 px-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded bg-accent-soft text-accent">
            <Icon name="notebook" size={14} />
          </span>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => onRenameEnd(draft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onRenameEnd(draft);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onRenameEnd(null);
              }
            }}
            aria-label="Notebook name"
            className={`${input} h-7 max-w-sm`}
          />
        </div>
      ) : (
        <button
          onClick={onOpen}
          className="flex h-9 w-full items-center gap-2 rounded-md px-2 pr-28 text-left transition-colors hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          aria-label={`Open notebook ${notebook.name}`}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded bg-accent-soft text-accent">
            <Icon name="notebook" size={14} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{notebook.name}</span>
          <span className="shrink-0 text-[12px] tabular-nums text-muted">{cellsLabel(notebook.cells.length)}</span>
          {folderName && (
            <Chip className="max-w-40 shrink-0 [&>span]:truncate">
              <Icon name="folder" size={12} className="mr-1 shrink-0" />
              <span>{folderName}</span>
            </Chip>
          )}
          <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-faint">{relativeTime(notebook.updatedAt)}</span>
        </button>
      )}
      {!renaming && (
        <HoverTray>
          <button onClick={onOpen} className={btn.iconSm} title="Open" aria-label={`Open ${notebook.name}`}>
            <Icon name="chevronRight" size={14} />
          </button>
          <button
            onClick={() => {
              setDraft(notebook.name);
              onRenameStart();
            }}
            className={btn.iconSm}
            title="Rename"
            aria-label={`Rename ${notebook.name}`}
          >
            <Icon name="edit" size={14} />
          </button>
          <button onClick={onDelete} className={btn.iconSm} title="Delete" aria-label={`Delete ${notebook.name}`}>
            <Icon name="trash" size={14} />
          </button>
        </HoverTray>
      )}
    </li>
  );
}

function NotebookList() {
  const notebooks = useWorkspaceStore((s) => s.notebooks);
  const folders = useWorkspaceStore((s) => s.folders);
  const renameNotebook = useWorkspaceStore((s) => s.renameNotebook);
  const deleteNotebook = useWorkspaceStore((s) => s.deleteNotebook);
  const openNotebook = useUiStore((s) => s.openNotebook);
  const [search, setSearch] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Notebook | null>(null);

  const folderNames = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...notebooks].sort((a, b) => b.updatedAt - a.updatedAt);
    return q ? sorted.filter((n) => n.name.toLowerCase().includes(q)) : sorted;
  }, [notebooks, search]);

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto bg-surface">
      <div className="mx-auto w-full max-w-[1100px] px-5 pb-16 pt-6 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="qp-display text-[30px] leading-9 text-ink">Notebooks</h1>
          <span className="text-[12px] tabular-nums text-muted">{notebooks.length === 1 ? "1 notebook" : `${notebooks.length} notebooks`}</span>
          <div className="ml-auto flex items-center gap-2">
            {notebooks.length > 0 && (
              <label className="relative">
                <Icon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search notebooks"
                  aria-label="Search notebooks"
                  className={`${input} w-56 pl-8`}
                />
              </label>
            )}
          </div>
        </div>

        {notebooks.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-1 text-center">
            <span className="mb-2 flex size-9 items-center justify-center rounded-lg bg-raised text-muted">
              <Icon name="notebook" size={18} />
            </span>
            <p className="text-[14px] font-medium text-ink">No notebooks yet</p>
            <p className="max-w-sm text-[13px] text-muted">Mix SQL cells and notes into a document you can run top to bottom.</p>
            <button className={`${btn.primary} mt-3`} onClick={() => startNotebook(null)}>
              <Icon name="plus" size={16} />
              Create a notebook
            </button>
          </div>
        ) : visible.length === 0 ? (
          <p className="mt-10 text-center text-[13px] text-muted">No notebooks match “{search.trim()}”.</p>
        ) : (
          <ul className="mt-4 rounded-lg border border-line bg-surface px-1 py-1" aria-label="Notebooks">
            {visible.map((n) => (
              <NotebookRow
                key={n.id}
                notebook={n}
                folderName={n.folderId ? folderNames.get(n.folderId) ?? null : null}
                renaming={renamingId === n.id}
                onOpen={() => openNotebook(n.id)}
                onRenameStart={() => setRenamingId(n.id)}
                onRenameEnd={(name) => {
                  setRenamingId(null);
                  if (name && name.trim()) renameNotebook(n.id, name.trim());
                }}
                onDelete={() => setConfirming(n)}
              />
            ))}
          </ul>
        )}
      </div>

      {confirming && (
        <Dialog
          title="Delete notebook"
          onClose={() => setConfirming(null)}
          width="max-w-sm"
          footer={
            <>
              <button onClick={() => setConfirming(null)} className={btn.secondary}>
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteNotebook(confirming.id);
                  setConfirming(null);
                }}
                className={btn.danger}
                aria-label={`Confirm delete ${confirming.name}`}
              >
                Delete notebook
              </button>
            </>
          }
        >
          <p className="text-[14px] leading-5 text-ink">
            Delete “{confirming.name}” and its {cellsLabel(confirming.cells.length)}? This cannot be undone.
          </p>
        </Dialog>
      )}
    </div>
  );
}

/** The Notebooks page: the space's notebook list, or the open notebook when one is selected. */
export default function NotebooksPage() {
  const notebookId = useUiStore((s) => s.notebookId);
  const notebook = useWorkspaceStore((s) => (notebookId ? s.notebooks.find((n) => n.id === notebookId) : undefined));
  if (notebookId && notebook) return <NotebookView key={notebook.id} notebook={notebook} />;
  return <NotebookList />;
}
