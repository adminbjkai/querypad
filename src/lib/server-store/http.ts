import { namespaceFrom } from "./fs-store";

export const NAMESPACE_COOKIE = "querypad_ns";

export function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

export function namespaceOf(req: Request): string {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${NAMESPACE_COOKIE}=([^;]+)`));
  return namespaceFrom(match?.[1]);
}

/** Writes are only accepted from this app's own pages (browsers label cross-site requests). */
export function crossSiteError(req: Request): Response | null {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return json({ error: "Cross-site requests are not allowed." }, 403);
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.get("host")) return json({ error: "Cross-site requests are not allowed." }, 403);
    } catch {
      return json({ error: "Invalid Origin header." }, 400);
    }
  }
  return null;
}
