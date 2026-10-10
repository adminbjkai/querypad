import { isSafeId, patchIndex, readIndex, readSnippets, readSpaceRevs, type IndexPatch } from "@/lib/server-store/fs-store";
import { crossSiteError, json, namespaceOf } from "@/lib/server-store/http";
import { createHash } from "node:crypto";
import { REVALIDATE_HEADERS, etag, isFresh, notModified } from "./conditional";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The space list, each space's rev and the snippet library's rev — polled by open clients to pick up
 * remote changes. Tagged with a hash of the body, so an unchanged poll is answered with an empty 304.
 */
export async function GET(req: Request) {
  const ns = namespaceOf(req);
  const [index, revs, snippets] = await Promise.all([readIndex(ns), readSpaceRevs(ns), readSnippets(ns)]);
  const body = JSON.stringify({ index: { rev: index.rev, activeId: index.activeId, spaces: index.spaces }, revs, snippetsRev: snippets.rev });
  const tag = etag(ns, createHash("sha1").update(body).digest("base64url"));
  if (isFresh(req, tag)) return notModified(tag);
  return new Response(body, { headers: { "Content-Type": "application/json", ...REVALIDATE_HEADERS, ETag: tag } });
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
