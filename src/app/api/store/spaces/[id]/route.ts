import { deleteSpace, isDeleted, isSafeId, readSpace, writeSpaceState } from "@/lib/server-store/fs-store";
import { crossSiteError, json, namespaceOf } from "@/lib/server-store/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isSafeId(id)) return json({ error: "Bad space id." }, 400);
  const space = await readSpace(namespaceOf(req), id);
  return space ? json(space) : json({ error: "Not found." }, 404);
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isSafeId(id)) return json({ error: "Bad space id." }, 400);
  const blocked = crossSiteError(req);
  if (blocked) return blocked;
  const ns = namespaceOf(req);
  if (await isDeleted(ns, id)) return json({ error: "This space was deleted." }, 410);
  const state = await req.json().catch(() => null);
  if (!state || typeof state !== "object" || Array.isArray(state)) return json({ error: "Expected a state object." }, 400);
  return json(await writeSpaceState(ns, id, state));
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isSafeId(id)) return json({ error: "Bad space id." }, 400);
  const blocked = crossSiteError(req);
  if (blocked) return blocked;
  const ns = namespaceOf(req);
  await deleteSpace(ns, id);
  return json({ ok: true });
}
