import type { QueryResult } from "@/types";

const meta = new WeakMap<QueryResult, { id: number; at: number }>();
let nextId = 1;

/** Stable id and first-seen timestamp for a result object (results carry no run time themselves). */
export function resultMeta(result: QueryResult): { id: number; at: number } {
  let entry = meta.get(result);
  if (!entry) {
    entry = { id: nextId++, at: Date.now() };
    meta.set(result, entry);
  }
  return entry;
}
