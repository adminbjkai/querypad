"use client";

import { useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { relativeTime } from "@/components/home/format";
import { Icon } from "@/components/ui/icons";
import { HoverTray, btn } from "@/components/ui/primitives";
import type { Folder } from "@/types";
import ConfirmDialog from "./ConfirmDialog";
import NameDialog from "./NameDialog";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A folder tile: icon, name, what it holds, last change; hover tray Rename · Delete. */
export default function FolderCard({ folder, queries, notebooks }: { folder: Folder; queries: number; notebooks: number }) {
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const updatedAt = useWorkspaceStore((s) =>
    Math.max(
      folder.updatedAt,
      ...s.savedQueries.filter((q) => q.folderId === folder.id).map((q) => q.updatedAt),
      ...s.notebooks.filter((n) => n.folderId === folder.id).map((n) => n.updatedAt)
    )
  );
  return (
    <li className="group relative">
      <button
        onClick={() => useUiStore.getState().openFolder(folder.id)}
        className="flex h-full w-full items-start gap-3 rounded-lg border border-line bg-surface p-4 text-left shadow-sm transition-colors hover:border-line-strong hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        aria-label={`Folder ${folder.name}`}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Icon name="folder" size={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium leading-5 text-ink">{folder.name}</span>
          <span className="mt-0.5 block text-[12px] leading-4 tabular-nums text-muted">
            {plural(queries, "query").replace("querys", "queries")} · {plural(notebooks, "notebook")}
          </span>
          <span className="mt-1.5 block text-[11px] leading-4 tabular-nums text-faint">Updated {relativeTime(updatedAt)}</span>
        </span>
      </button>
      <HoverTray className="top-3! translate-y-0!">
        <button onClick={() => setDialog("rename")} className={btn.iconSm} title="Rename folder" aria-label={`Rename folder ${folder.name}`}>
          <Icon name="edit" size={14} />
        </button>
        <button onClick={() => setDialog("delete")} className={`${btn.iconSm} hover:text-danger`} title="Delete folder" aria-label={`Delete folder ${folder.name}`}>
          <Icon name="trash" size={14} />
        </button>
      </HoverTray>
      {dialog === "rename" && (
        <NameDialog
          title="Rename folder"
          label="Folder name"
          initial={folder.name}
          action="Rename"
          onSubmit={(name) => useWorkspaceStore.getState().renameFolder(folder.id, name)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "delete" && (
        <ConfirmDialog title="Delete folder?" action="Delete folder" onConfirm={() => useWorkspaceStore.getState().deleteFolder(folder.id)} onClose={() => setDialog(null)}>
          <span className="font-medium text-ink">{folder.name}</span> goes away; its {plural(queries, "query").replace("querys", "queries")} and{" "}
          {plural(notebooks, "notebook")} stay in this space as unfiled items.
        </ConfirmDialog>
      )}
    </li>
  );
}
