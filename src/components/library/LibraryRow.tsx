"use client";

import { useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { openSavedQueryInWorkbench } from "@/lib/workspace-actions";
import { relativeTime } from "@/components/home/format";
import { Icon } from "@/components/ui/icons";
import { Chip, HoverTray, btn } from "@/components/ui/primitives";
import type { Notebook, SavedQuery } from "@/types";
import ConfirmDialog from "./ConfirmDialog";
import MoveToFolderDialog from "./MoveToFolderDialog";
import NameDialog from "./NameDialog";

/** One library item: a saved query or a notebook, with the same row and actions for both. */
export type LibraryItem = { kind: "query"; item: SavedQuery } | { kind: "notebook"; item: Notebook };

export function openLibraryItem(entry: LibraryItem): void {
  if (entry.kind === "query") openSavedQueryInWorkbench(entry.item.id);
  else useUiStore.getState().openNotebook(entry.item.id);
}

export const rowClass =
  "group relative flex h-9 items-center gap-3 px-3 text-[13px] transition-colors hover:bg-sunken";

/** 36px row: icon, name (opens the item), kind chip, folder meta, updated; hover tray Open · Rename · Move · Delete. */
export default function LibraryRow({ entry, showFolder = false }: { entry: LibraryItem; showFolder?: boolean }) {
  const { kind, item } = entry;
  const folderName = useWorkspaceStore((s) => (showFolder && item.folderId ? s.folders.find((f) => f.id === item.folderId)?.name : undefined));
  const [dialog, setDialog] = useState<"rename" | "move" | "delete" | null>(null);
  const label = kind === "query" ? "Query" : "Notebook";
  const store = () => useWorkspaceStore.getState();
  const rename = (name: string) => (kind === "query" ? store().renameSavedQuery(item.id, name) : store().renameNotebook(item.id, name));
  const move = (folderId: string | null) => (kind === "query" ? store().moveSavedQuery(item.id, folderId) : store().moveNotebook(item.id, folderId));
  const remove = () => (kind === "query" ? store().deleteSavedQuery(item.id) : store().deleteNotebook(item.id));

  return (
    <li className={rowClass}>
      <Icon name={kind === "query" ? "bookmark" : "notebook"} size={14} className={`shrink-0 ${kind === "query" ? "fill-current text-accent" : "text-muted"}`} />
      <button
        onClick={() => openLibraryItem(entry)}
        className="min-w-0 flex-1 truncate rounded text-left font-medium text-ink hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        title={`Open ${item.name}`}
        aria-label={`${label} ${item.name}`}
      >
        {item.name}
      </button>
      {/* Metadata gives way to the hover tray so the two never overlap. */}
      <span className="flex shrink-0 items-center gap-3 group-hover:invisible group-focus-within:invisible">
        <Chip tone={kind === "query" ? "accent" : "neutral"}>{label}</Chip>
        {folderName && (
          <span className="hidden max-w-32 truncate text-[12px] text-muted sm:inline" title={folderName}>
            <Icon name="folder" size={12} className="mr-1 inline-block align-[-2px] text-faint" />
            {folderName}
          </span>
        )}
        <span className="w-16 text-right text-[11px] tabular-nums text-faint">{relativeTime(item.updatedAt)}</span>
      </span>
      <HoverTray>
        <button onClick={() => openLibraryItem(entry)} className={btn.iconSm} title="Open" aria-label={`Open ${item.name}`}>
          <Icon name="play" size={14} />
        </button>
        <button onClick={() => setDialog("rename")} className={btn.iconSm} title="Rename" aria-label={`Rename ${item.name}`}>
          <Icon name="edit" size={14} />
        </button>
        <button onClick={() => setDialog("move")} className={btn.iconSm} title="Move to folder" aria-label={`Move ${item.name}`}>
          <Icon name="folder" size={14} />
        </button>
        <button onClick={() => setDialog("delete")} className={`${btn.iconSm} hover:text-danger`} title="Delete" aria-label={`Delete ${item.name}`}>
          <Icon name="trash" size={14} />
        </button>
      </HoverTray>
      {dialog === "rename" && (
        <NameDialog title={`Rename ${label.toLowerCase()}`} label="Name" initial={item.name} action="Rename" onSubmit={rename} onClose={() => setDialog(null)} />
      )}
      {dialog === "move" && <MoveToFolderDialog name={item.name} current={item.folderId} onMove={move} onClose={() => setDialog(null)} />}
      {dialog === "delete" && (
        <ConfirmDialog title={`Delete ${label.toLowerCase()}?`} action="Delete" onConfirm={remove} onClose={() => setDialog(null)}>
          <span className="font-medium text-ink">{item.name}</span> is removed from this space on every device.
          {kind === "query" && " Open tabs keep their SQL."}
        </ConfirmDialog>
      )}
    </li>
  );
}
