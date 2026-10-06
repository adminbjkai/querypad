import { isSafeId, patchSnippets, readSnippets, type StoredSnippet } from "@/lib/server-store/fs-store";
import { crossSiteError, json, namespaceOf } from "@/lib/server-store/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SQL_CHARS = 200_000;

export async function GET(req: Request) {
  const { rev, snippets } = await readSnippets(namespaceOf(req));
  return json({ rev, snippets });
}

function validSnippet(value: unknown): value is StoredSnippet {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    isSafeId(s.id) &&
    typeof s.name === "string" &&
    s.name.length <= 200 &&
    typeof s.sql === "string" &&
    s.sql.length <= MAX_SQL_CHARS &&
    typeof s.updatedAt === "number" &&
    typeof s.createdAt === "number" &&
    (s.folder === undefined || (typeof s.folder === "string" && s.folder.length <= 100)) &&
    (s.description === undefined || (typeof s.description === "string" && s.description.length <= 2000))
  );
}

/** { upsert?: Snippet[], remove?: id[] } — merged per snippet, newest edit wins. */
export async function PATCH(req: Request) {
  const blocked = crossSiteError(req);
  if (blocked) return blocked;
  const body = (await req.json().catch(() => null)) as { upsert?: unknown; remove?: unknown } | null;
  if (
    !body ||
    (body.upsert !== undefined && !(Array.isArray(body.upsert) && body.upsert.every(validSnippet))) ||
    (body.remove !== undefined && !(Array.isArray(body.remove) && body.remove.every((id) => typeof id === "string")))
  ) {
    return json({ error: "Expected { upsert?: Snippet[], remove?: string[] }." }, 400);
  }
  return json(
    await patchSnippets(namespaceOf(req), {
      upsert: body.upsert as StoredSnippet[] | undefined,
      remove: body.remove as string[] | undefined,
    })
  );
}
