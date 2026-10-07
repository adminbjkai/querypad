import type { PersistedState, SpaceMeta } from "./browser";

/**
 * Helpers that keep save traffic down: a state record is only written when what it
 * serializes to changed, and the space list is only refreshed when its entry would differ.
 */

/** Exactly what a state save sends, as a comparable string. */
export function snapshotKey(state: PersistedState): string {
  return JSON.stringify(state);
}

/** A space's "updated" time may lag its last save this long before the list is refreshed. */
export const INDEX_TOUCH_MS = 60_000;

/**
 * Whether the space list entry needs a save after `meta`'s state was written: the table
 * count moved, or its updated time has fallen behind by more than INDEX_TOUCH_MS.
 * (Renames save the list themselves.)
 */
export function indexEntryStale(meta: SpaceMeta | undefined, tableCount: number, now: number): boolean {
  if (!meta) return true;
  return meta.tableCount !== tableCount || now - meta.updatedAt >= INDEX_TOUCH_MS;
}
