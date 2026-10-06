import { readIndex, readSpaceRevs, writeIndex } from "@/lib/server-store/fs-store";
import { crossSiteError, json, namespaceOf } from "@/lib/server-store/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The space list plus each space's rev — polled by open clients to pick up remote changes. */
export async function GET(req: Request) {
  const ns = namespaceOf(req);
  const [index, revs] = await Promise.all([readIndex(ns), readSpaceRevs(ns)]);
  return json({ index, revs });
}

export async function PUT(req: Request) {
  const blocked = crossSiteError(req);
  if (blocked) return blocked;
  const body = (await req.json().catch(() => null)) as { activeId?: unknown; spaces?: unknown } | null;
  if (!body || !Array.isArray(body.spaces) || (body.activeId !== null && typeof body.activeId !== "string")) {
    return json({ error: "Expected { activeId, spaces }." }, 400);
  }
  return json(await writeIndex(namespaceOf(req), body.activeId as string | null, body.spaces));
}
