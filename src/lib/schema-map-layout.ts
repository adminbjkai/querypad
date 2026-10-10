import type { ColumnInfo } from "../types";
import type { Relationship } from "../types/discovery";

export const NODE_W = 184;
export const NODE_H = 56;
const COL_GAP = 112;
const ROW_GAP = 18;
const PAD = 24;

/** A table or view drawn on the Home schema map. */
export interface MapObject {
  name: string;
  rowCount: number | null;
  columns: ColumnInfo[];
  view: boolean;
}

export interface Placed extends MapObject {
  x: number;
  y: number;
}

/**
 * Columns of the map, left to right: a table sits one column left of everything it references,
 * so fact tables lead and the lookups they point at settle on the right. Objects without joins
 * fill a last column of their own.
 */
export function layoutMap(objects: MapObject[], relationships: Pick<Relationship, "from" | "to">[]): { placed: Placed[]; width: number; height: number } {
  const names = new Set(objects.map((o) => o.name));
  const out = new Map<string, Set<string>>();
  for (const r of relationships) {
    if (r.from.table === r.to.table || !names.has(r.from.table) || !names.has(r.to.table)) continue;
    if (!out.has(r.from.table)) out.set(r.from.table, new Set());
    out.get(r.from.table)!.add(r.to.table);
  }
  const linked = new Set<string>();
  for (const [from, tos] of out) {
    linked.add(from);
    for (const t of tos) linked.add(t);
  }
  // Depth = longest chain of references from a table down to a table that references nothing.
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (name: string): number => {
    const known = depth.get(name);
    if (known !== undefined) return known;
    if (visiting.has(name)) return 0; // a cycle: stop climbing
    visiting.add(name);
    let d = 0;
    for (const to of out.get(name) ?? []) d = Math.max(d, depthOf(to) + 1);
    visiting.delete(name);
    depth.set(name, d);
    return d;
  };
  const maxDepth = Math.max(0, ...[...linked].map(depthOf));
  const columns: MapObject[][] = Array.from({ length: maxDepth + 1 }, () => []);
  const loose: MapObject[] = [];
  for (const o of objects) {
    if (linked.has(o.name)) columns[maxDepth - depthOf(o.name)].push(o);
    else loose.push(o);
  }
  if (loose.length) {
    // Without joins there is nothing to read left to right: wrap loose objects into short columns.
    const perColumn = Math.max(3, Math.ceil(Math.sqrt(loose.length)));
    for (let i = 0; i < loose.length; i += perColumn) columns.push(loose.slice(i, i + perColumn));
  }
  const filled = columns.filter((c) => c.length > 0);
  const tallest = Math.max(1, ...filled.map((c) => c.length));
  const height = PAD * 2 + tallest * NODE_H + (tallest - 1) * ROW_GAP;
  const placed: Placed[] = [];
  filled.forEach((column, ci) => {
    const sorted = [...column].sort((a, b) => a.name.localeCompare(b.name));
    const used = sorted.length * NODE_H + (sorted.length - 1) * ROW_GAP;
    const top = (height - used) / 2;
    sorted.forEach((o, ri) => placed.push({ ...o, x: PAD + ci * (NODE_W + COL_GAP), y: top + ri * (NODE_H + ROW_GAP) }));
  });
  const width = PAD * 2 + filled.length * NODE_W + Math.max(0, filled.length - 1) * COL_GAP;
  return { placed, width, height };
}

