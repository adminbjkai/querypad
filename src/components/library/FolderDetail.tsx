"use client";

import { useMemo, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { startNotebook } from "@/components/workspace/NavRail";
import { Icon } from "@/components/ui/icons";
import { Menu, SectionLabel, btn, input } from "@/components/ui/primitives";
import type { Folder } from "@/types";
import LibraryRow from "./LibraryRow";
import NameDialog from "./NameDialog";
import { itemsInFolder } from "./library-items";

/** Start an empty saved query in `folderId` (null = unfiled) and open it in the workbench. */
export function newQueryInFolder(folderId: string | null): void {
  const store = useWorkspaceStore.getState();
  store.setViewMode("sql");
  if (!store.addTab("")) return;
  store.saveQuery(store.activeTabId, "Untitled query", folderId);
  useUiStore.getState().setWorkspacePage("workbench");
}

/** The contents of one folder: search, "New" menu and a row per query or notebook. */
export default function FolderDetail({ folder }: { folder: Folder }) {
  const savedQueries = useWorkspaceStore((s) => s.savedQueries);
  const notebooks = useWorkspaceStore((s) => s.notebooks);
  const [search, setSearch] = useState("");
  const [naming, setNaming] = useState<"notebook" | null>(null);
  const items = useMemo(() => itemsInFolder(savedQueries, notebooks, folder.id), [savedQueries, notebooks, folder.id]);
  const q = search.trim().toLowerCase();
  const visible = q ? items.filter((e) => e.item.name.toLowerCase().includes(q)) : items;

  const createNotebook = (name: string) => startNotebook(folder.id, name);
  const newMenu = (
    <Menu
      label="New in folder"
      trigger={({ open, toggle }) => (
        <button onClick={toggle} className={btn.primary} aria-haspopup="menu" aria-expanded={open}>
          <Icon name="plus" size={16} />
          New
          <Icon name="chevronDown" size={14} className="opacity-70" />
        </button>
      )}
      items={[
        { label: "New query", icon: "bookmark", onSelect: () => newQueryInFolder(folder.id) },
        { label: "New notebook", icon: "notebook", onSelect: () => setNaming("notebook") },
      ]}
    />
  );

  return (
    <section aria-label={`Folder ${folder.name}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Icon name="folder" size={24} />
        </span>
        <h1 className="qp-display min-w-0 flex-1 truncate text-[30px] leading-9 text-ink">{folder.name}</h1>
        {newMenu}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <label className="relative min-w-40 flex-1">
            <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input className={`${input} pl-9`} aria-label="Search folder" placeholder="Search this folder…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <span className="px-1 text-[12px] tabular-nums text-muted">
            {visible.length} {visible.length === 1 ? "item" : "items"}
          </span>
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-12 text-center">
            <span className="flex size-9 items-center justify-center rounded-lg bg-raised text-muted">
              <Icon name="folder" size={18} />
            </span>
            <p className="mt-3 text-[14px] font-medium text-ink">Nothing here yet</p>
            <p className="mt-1 text-[13px] leading-5 text-muted">Save a query into this folder, or start one from here.</p>
            <button onClick={() => newQueryInFolder(folder.id)} className={`${btn.primary} mt-4`}>
              <Icon name="plus" size={16} />
              New query
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-muted">
            <p>Nothing in this folder matches “{search}”.</p>
            <button className={`${btn.ghost} mt-2`} onClick={() => setSearch("")}>Clear search</button>
          </div>
        ) : (
          <>
            <div className="px-3 pt-3 pb-1">
              <SectionLabel as="div" count={visible.length}>Items</SectionLabel>
            </div>
            <ul className="divide-y divide-line border-t border-line" aria-label={`Items in ${folder.name}`}>
              {visible.map((entry) => (
                <LibraryRow key={`${entry.kind}:${entry.item.id}`} entry={entry} />
              ))}
            </ul>
          </>
        )}
      </div>
      {naming === "notebook" && (
        <NameDialog title="New notebook" label="Notebook name" initial="Untitled notebook" action="Create" onSubmit={createNotebook} onClose={() => setNaming(null)} />
      )}
    </section>
  );
}
