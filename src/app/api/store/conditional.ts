/**
 * Conditional GETs for store reads. Responses are revalidated on every use (`no-cache`), so a
 * client that already has the current version gets an empty 304 instead of the body again. The
 * same URL serves a different namespace per `querypad_ns` cookie, hence `Vary: Cookie` and the
 * namespace inside the tag.
 */
export const REVALIDATE_HEADERS = { "Cache-Control": "private, no-cache", Vary: "Cookie" };

export function etag(ns: string, version: string): string {
  return `"${ns}:${version}"`;
}

/** True when the request's If-None-Match already names `tag` (weak or strong). */
export function isFresh(req: Request, tag: string): boolean {
  const header = req.headers.get("if-none-match");
  if (!header) return false;
  return header.split(",").some((value) => {
    const candidate = value.trim();
    return candidate === "*" || candidate.replace(/^W\//, "") === tag;
  });
}

export function notModified(tag: string): Response {
  return new Response(null, { status: 304, headers: { ...REVALIDATE_HEADERS, ETag: tag } });
}
