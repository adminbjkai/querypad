import { AiHttpError, streamComplete, type ChatTurn } from "@/lib/ai/complete";
import { AI_PROVIDER_IDS, getAiProviderConfig, isAiProvider, type AiEffort, type AiProvider } from "@/lib/ai/providers";
import { availableBridgeModels, streamFromBridge } from "@/lib/ai/local-bridge";

export const runtime = "nodejs";
// Keys come from the runtime environment (container env), never from build time.
export const dynamic = "force-dynamic";

const MAX_PROMPT_CHARS = 200_000;
const MAX_TOKENS_LIMIT = 4096;
const DEFAULT_MAX_TOKENS = 1024;
const MAX_HISTORY_TURNS = 40;

function serverKey(provider: AiProvider): string | undefined {
  return process.env[getAiProviderConfig(provider).envKey] || undefined;
}

function text(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Providers usable without a browser key: server-side keys, plus signed-in local CLIs. */
export async function GET() {
  const bridgeModels = await availableBridgeModels();
  const providers = AI_PROVIDER_IDS.filter((id) => {
    const config = getAiProviderConfig(id);
    return config.kind === "local" ? bridgeModels.includes(config.bridgeModel!) : !!serverKey(id);
  });
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

/** Validate optional conversation history; returns clean turns or null if malformed. */
function parseHistory(value: unknown): ChatTurn[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_HISTORY_TURNS) return null;
  const turns: ChatTurn[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const { role, content } = item as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    turns.push({ role, content });
  }
  return turns;
}

/** Stream a completion for a server-managed provider as plain-text deltas. */
export async function POST(req: Request) {
  const rejected = crossSiteReason(req);
  if (rejected) return text(rejected, 403);

  const body = (await req.json().catch(() => null)) as {
    provider?: unknown;
    system?: unknown;
    input?: unknown;
    history?: unknown;
    maxTokens?: unknown;
    effort?: unknown;
  } | null;
  if (!body) return text("Request body must be JSON.", 400);

  const { provider, system, input, maxTokens } = body;
  if (!isAiProvider(provider)) {
    return text(`Unknown provider. Use one of: ${AI_PROVIDER_IDS.join(", ")}.`, 400);
  }
  if (typeof system !== "string" || typeof input !== "string") {
    return text("system and input must be strings.", 400);
  }
  const history = parseHistory(body.history);
  if (!history) {
    return text(
      `history must be an array of at most ${MAX_HISTORY_TURNS} {role: "user" | "assistant", content: string} turns.`,
      400
    );
  }
  const historyChars = history.reduce((sum, turn) => sum + turn.content.length, 0);
  if (system.length + input.length + historyChars > MAX_PROMPT_CHARS) {
    return text(`Prompt too large (max ${MAX_PROMPT_CHARS} characters).`, 413);
  }

  const config = getAiProviderConfig(provider);
  const effort: AiEffort | undefined =
    body.effort === "low" || body.effort === "medium" ? body.effort : undefined;
  const apiKey = config.kind === "local" ? "" : serverKey(provider);
  if (config.kind !== "local" && !apiKey) {
    const { label } = getAiProviderConfig(provider);
    return text(`${label} is not configured on this server. Add your own API key instead.`, 400);
  }

  const requested = typeof maxTokens === "number" && Number.isFinite(maxTokens) ? maxTokens : DEFAULT_MAX_TOKENS;
  const clampedMaxTokens = Math.min(MAX_TOKENS_LIMIT, Math.max(1, Math.floor(requested)));

  const chunks =
    config.kind === "local"
      ? streamFromBridge({ model: config.bridgeModel!, effort, system, input, history, signal: req.signal })
      : streamComplete({
          provider,
          apiKey,
          system,
          input,
          history,
          maxTokens: clampedMaxTokens,
          signal: req.signal,
        });

  // Pull the first chunk before responding so upstream failures map to a real status.
  let first: IteratorResult<string>;
  try {
    first = await chunks.next();
  } catch (err) {
    const status =
      err instanceof AiHttpError ? err.status : typeof (err as { status?: unknown }).status === "number" ? (err as { status: number }).status : 502;
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
