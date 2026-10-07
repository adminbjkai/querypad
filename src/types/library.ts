/**
 * The query library: folders holding saved queries and notebooks. All three live with
 * the space (persisted in its state record) and are never shared through live rooms.
 */
export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  folderId: string | null;
  createdAt: number;
  updatedAt: number;
}

export type NotebookCellKind = "sql" | "markdown";

export interface NotebookCell {
  id: string;
  kind: NotebookCellKind;
  source: string;
}

export interface Notebook {
  id: string;
  name: string;
  folderId: string | null;
  cells: NotebookCell[];
  createdAt: number;
  updatedAt: number;
}
