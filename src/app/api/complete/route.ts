import { AiHttpError, streamComplete } from "@/lib/ai/complete";
import { AI_PROVIDER_IDS, getAiProviderConfig, isAiProvider, type AiProvider } from "@/lib/ai/providers";

export const runtime = "nodejs";
// Keys come from the runtime environment (container env), never from build time.
export const dynamic = "force-dynamic";

const MAX_PROMPT_CHARS = 200_000;
const MAX_TOKENS_LIMIT = 4096;
const DEFAULT_MAX_TOKENS = 1024;

function serverKey(provider: AiProvider): string | undefined {
  return process.env[getAiProviderConfig(provider).envKey] || undefined;
}

function text(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Providers with a server-side key configured (ids only, never key values). */
export async function GET() {
  const providers = AI_PROVIDER_IDS.filter((id) => serverKey(id));
  return Response.json({ providers }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Only this app's own pages may spend the server's keys. A JSON content type forces a
 * CORS preflight for cross-site callers (which we never answer), and browsers label
 * cross-site requests via Origin / Sec-Fetch-Site.
 */
function crossSiteReason(req: Request): string | null {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return "Content-Type must be application/json.";
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return "Cross-site requests are not allowed.";
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.get("host")) return "Cross-site requests are not allowed.";
    } catch {
      return "Invalid Origin header.";
    }
  }
  return null;
}

/** Stream a completion for a server-managed provider as plain-text deltas. */
export async function POST(req: Request) {
  const rejected = crossSiteReason(req);
  if (rejected) return text(rejected, 403);

  const body = (await req.json().catch(() => null)) as {
    provider?: unknown;
    system?: unknown;
    input?: unknown;
    maxTokens?: unknown;
  } | null;
  if (!body) return text("Request body must be JSON.", 400);

  const { provider, system, input, maxTokens } = body;
  if (!isAiProvider(provider)) {
    return text(`Unknown provider. Use one of: ${AI_PROVIDER_IDS.join(", ")}.`, 400);
  }
  if (typeof system !== "string" || typeof input !== "string") {
    return text("system and input must be strings.", 400);
  }
  if (system.length + input.length > MAX_PROMPT_CHARS) {
    return text(`Prompt too large (max ${MAX_PROMPT_CHARS} characters).`, 413);
  }

  const apiKey = serverKey(provider);
  if (!apiKey) {
    const { label } = getAiProviderConfig(provider);
    return text(`${label} is not configured on this server. Add your own API key instead.`, 400);
  }

  const requested = typeof maxTokens === "number" && Number.isFinite(maxTokens) ? maxTokens : DEFAULT_MAX_TOKENS;
  const clampedMaxTokens = Math.min(MAX_TOKENS_LIMIT, Math.max(1, Math.floor(requested)));

  const chunks = streamComplete({
    provider,
    apiKey,
    system,
    input,
    maxTokens: clampedMaxTokens,
    signal: req.signal,
  });

  // Pull the first chunk before responding so upstream failures map to a real status.
  let first: IteratorResult<string>;
  try {
    first = await chunks.next();
  } catch (err) {
    const status = err instanceof AiHttpError ? err.status : 502;
    return text(err instanceof Error ? err.message : "Upstream request failed.", status);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (first.done) controller.close();
      else if (first.value) controller.enqueue(encoder.encode(first.value));
    },
    async pull(controller) {
      try {
        const { done, value } = await chunks.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(value));
      } catch (err) {
        controller.error(err);
      }
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
