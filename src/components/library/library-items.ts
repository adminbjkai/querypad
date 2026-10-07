import type { Notebook, SavedQuery } from "@/types";
import type { LibraryItem } from "./LibraryRow";

/** Queries and notebooks of one folder (`null` = unfiled), newest change first. */
export function itemsInFolder(savedQueries: SavedQuery[], notebooks: Notebook[], folderId: string | null): LibraryItem[] {
  const items: LibraryItem[] = [
    ...savedQueries.filter((q) => q.folderId === folderId).map((item) => ({ kind: "query" as const, item })),
    ...notebooks.filter((n) => n.folderId === folderId).map((item) => ({ kind: "notebook" as const, item })),
  ];
  return items.sort((a, b) => b.item.updatedAt - a.item.updatedAt);
}
