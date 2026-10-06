/** A saved piece of SQL in the snippet library (shared by every space and device). */
export interface Snippet {
  id: string;
  name: string;
  sql: string;
  /** Optional grouping shown in the Snippets panel; empty means "Unfiled". */
  folder?: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}
