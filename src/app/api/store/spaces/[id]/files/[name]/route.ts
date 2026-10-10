import { deleteSpaceFile, isDeleted, isSafeId, openSpaceFile, spaceFileVersion, writeSpaceFile } from "@/lib/server-store/fs-store";
import { crossSiteError, json, namespaceOf } from "@/lib/server-store/http";
import { REVALIDATE_HEADERS, etag, isFresh, notModified } from "@/app/api/store/conditional";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; name: string }> };

async function target(params: Ctx["params"]) {
  // Next already decodes route params; decoding again would mangle names containing "%".
  const { id, name: table } = await params;
  return isSafeId(id) && table.length > 0 && table.length <= 512 ? { id, table } : null;
}

export async function GET(req: Request, { params }: Ctx) {
  const t = await target(params);
  if (!t) return json({ error: "Bad file path." }, 400);
  const ns = namespaceOf(req);
  // Tagged with the version the space record lists, so a device reloading unchanged bytes gets a 304.
  const version = await spaceFileVersion(ns, t.id, t.table);
  if (!version) return json({ error: "Not found." }, 404);
  const tag = etag(ns, version);
  if (isFresh(req, tag)) return notModified(tag);
  const stream = await openSpaceFile(ns, t.id, t.table);
  if (!stream) return json({ error: "Not found." }, 404);
  return new Response(stream, {
    headers: { "Content-Type": "application/octet-stream", ...REVALIDATE_HEADERS, ETag: tag },
  });
}

export async function PUT(req: Request, { params }: Ctx) {
  const t = await target(params);
  if (!t) return json({ error: "Bad file path." }, 400);
  const blocked = crossSiteError(req);
  if (blocked) return blocked;
  if (!req.body) return json({ error: "Missing file body." }, 400);
  if (await isDeleted(namespaceOf(req), t.id)) return json({ error: "This space was deleted." }, 410);
  return json(await writeSpaceFile(namespaceOf(req), t.id, t.table, req.body));
}

export async function DELETE(req: Request, { params }: Ctx) {
  const t = await target(params);
  if (!t) return json({ error: "Bad file path." }, 400);
  const blocked = crossSiteError(req);
  if (blocked) return blocked;
  return json(await deleteSpaceFile(namespaceOf(req), t.id, t.table));
}
