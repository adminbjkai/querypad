import { isSafeId, patchIndex, readIndex, readSpaceRevs, type IndexPatch } from "@/lib/server-store/fs-store";
import { crossSiteError, json, namespaceOf } from "@/lib/server-store/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The space list plus each space's rev — polled by open clients to pick up remote changes. */
export async function GET(req: Request) {
  const ns = namespaceOf(req);
  const [index, revs] = await Promise.all([readIndex(ns), readSpaceRevs(ns)]);
  return json({ index: { rev: index.rev, activeId: index.activeId, spaces: index.spaces }, revs });
}

/** Apply one device's changes to the space list: { activeId?, upsert?: SpaceMeta[], remove?: id[] }. */
export async function PATCH(req: Request) {
  const blocked = crossSiteError(req);
  if (blocked) return blocked;
  const body = (await req.json().catch(() => null)) as IndexPatch | null;
  const validMetas = (v: unknown) =>
    Array.isArray(v) && v.every((m) => m && typeof m === "object" && typeof (m as { id?: unknown }).id === "string" && isSafeId((m as { id: string }).id));
  if (
    !body ||
    (body.activeId !== undefined && body.activeId !== null && typeof body.activeId !== "string") ||
    (body.upsert !== undefined && !validMetas(body.upsert)) ||
    (body.remove !== undefined && !(Array.isArray(body.remove) && body.remove.every((id) => typeof id === "string")))
  ) {
    return json({ error: "Expected { activeId?, upsert?, remove? }." }, 400);
  }
  const { rev, prevRev, index } = await patchIndex(namespaceOf(req), body);
  return json({ rev, prevRev, spaces: index.spaces, activeId: index.activeId });
}
