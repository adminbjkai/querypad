import { deleteSpaceFile, isSafeId, openSpaceFile, writeSpaceFile } from "@/lib/server-store/fs-store";
import { crossSiteError, json, namespaceOf } from "@/lib/server-store/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; name: string }> };

async function target(params: Ctx["params"]) {
  const { id, name } = await params;
  const table = decodeURIComponent(name);
  return isSafeId(id) && table.length > 0 && table.length <= 512 ? { id, table } : null;
}

export async function GET(req: Request, { params }: Ctx) {
  const t = await target(params);
  if (!t) return json({ error: "Bad file path." }, 400);
  const stream = await openSpaceFile(namespaceOf(req), t.id, t.table);
  if (!stream) return json({ error: "Not found." }, 404);
  return new Response(stream, {
    headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" },
  });
}

export async function PUT(req: Request, { params }: Ctx) {
  const t = await target(params);
  if (!t) return json({ error: "Bad file path." }, 400);
  const blocked = crossSiteError(req);
  if (blocked) return blocked;
  if (!req.body) return json({ error: "Missing file body." }, 400);
  return json(await writeSpaceFile(namespaceOf(req), t.id, t.table, req.body));
}

export async function DELETE(req: Request, { params }: Ctx) {
  const t = await target(params);
  if (!t) return json({ error: "Bad file path." }, 400);
  const blocked = crossSiteError(req);
  if (blocked) return blocked;
  return json(await deleteSpaceFile(namespaceOf(req), t.id, t.table));
}
