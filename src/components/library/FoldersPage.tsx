"use client";

import { useMemo } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { Icon } from "@/components/ui/icons";
import { SectionLabel } from "@/components/ui/primitives";
import FolderCard from "./FolderCard";
import FolderDetail from "./FolderDetail";
import LibraryRow from "./LibraryRow";
import { itemsInFolder } from "./library-items";

function FolderGrid() {
  const folders = useWorkspaceStore((s) => s.folders);
  const savedQueries = useWorkspaceStore((s) => s.savedQueries);
  const notebooks = useWorkspaceStore((s) => s.notebooks);
  const sorted = useMemo(() => [...folders].sort((a, b) => a.name.localeCompare(b.name)), [folders]);
  const unfiled = useMemo(() => itemsInFolder(savedQueries, notebooks, null), [savedQueries, notebooks]);
  const empty = folders.length === 0 && unfiled.length === 0;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 flex-1 text-[22px] font-semibold leading-7 tracking-[-0.01em] text-ink">Folders</h1>
      </div>

      {empty ? (
        <div className="mt-8 flex flex-col items-center rounded-xl border border-line bg-surface px-4 py-14 text-center">
          <span className="flex size-9 items-center justify-center rounded-lg bg-raised text-muted">
            <Icon name="folder" size={18} />
          </span>
          <p className="mt-3 text-[14px] font-medium text-ink">No folders yet</p>
          <p className="mt-1 max-w-sm text-[13px] leading-5 text-muted">Folders keep saved queries and notebooks together. Use New folder above, or save a query from the editor.</p>
        </div>
      ) : (
        <>
          {sorted.length > 0 && (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Folders">
              {sorted.map((folder) => (
                <FolderCard
                  key={folder.id}
                  folder={folder}
                  queries={savedQueries.filter((q) => q.folderId === folder.id).length}
                  notebooks={notebooks.filter((n) => n.folderId === folder.id).length}
                />
              ))}
            </ul>
          )}
          <section aria-label="Unfiled" className="mt-8">
            <SectionLabel count={unfiled.length} className="mb-2">Unfiled</SectionLabel>
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              {unfiled.length === 0 ? (
                <p className="px-4 py-6 text-center text-[13px] text-muted">Everything is filed. Queries saved without a folder appear here.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {unfiled.map((entry) => (
                    <LibraryRow key={`${entry.kind}:${entry.item.id}`} entry={entry} />
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}

/** The library page: a grid of folders plus unfiled items, or one folder's contents when `folderId` is set. */
export default function FoldersPage() {
  const folderId = useUiStore((s) => s.folderId);
  const folder = useWorkspaceStore((s) => (folderId ? s.folders.find((f) => f.id === folderId) : undefined));
  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto bg-surface">
      <div className="mx-auto w-full max-w-[1080px] px-5 pb-16 pt-6 sm:px-8">{folder ? <FolderDetail folder={folder} /> : <FolderGrid />}</div>
    </div>
  );
}
