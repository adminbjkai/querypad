import { deleteSpace, isSafeId, readSpace, writeSpaceState } from "@/lib/server-store/fs-store";
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
  const state = await req.json().catch(() => null);
  if (!state || typeof state !== "object" || Array.isArray(state)) return json({ error: "Expected a state object." }, 400);
  return json(await writeSpaceState(namespaceOf(req), id, state));
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isSafeId(id)) return json({ error: "Bad space id." }, 400);
  const blocked = crossSiteError(req);
  if (blocked) return blocked;
  await deleteSpace(namespaceOf(req), id);
  return json({ ok: true });
}
