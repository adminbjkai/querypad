import { request, type IncomingMessage } from "node:http";
import type { AiEffort } from "./providers";
import type { ChatTurn } from "./complete";

/**
 * Server-only client for the host's local AI bridge (local-ai/bridge.mjs), which runs the
 * AI CLIs signed in on this machine. Reached over a Unix socket (QUERYPAD_BRIDGE_SOCKET,
 * mounted into the container) or a URL (QUERYPAD_BRIDGE_URL); QUERYPAD_BRIDGE_TOKEN authenticates.
 */
interface BridgeModel {
  id: string;
  available: boolean;
}

const HEALTH_TTL_MS = 30_000;
let cached: { at: number; models: Promise<BridgeModel[]> } | null = null;

function target(): { socketPath?: string; host?: string; port?: number; token: string } | null {
  const token = process.env.QUERYPAD_BRIDGE_TOKEN;
  if (!token) return null;
  const socketPath = process.env.QUERYPAD_BRIDGE_SOCKET;
  if (socketPath) return { socketPath, token };
  const url = process.env.QUERYPAD_BRIDGE_URL;
  if (!url) return null;
  const parsed = new URL(url);
  return { host: parsed.hostname, port: Number(parsed.port || 80), token };
}

function call(path: string, body: string | null, signal?: AbortSignal, timeoutMs?: number): Promise<IncomingMessage> {
  const t = target();
  if (!t) return Promise.reject(Object.assign(new Error("The local AI bridge isn't configured on this server."), { status: 503 }));
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath: t.socketPath,
        host: t.host,
        port: t.port,
        path,
        method: body === null ? "GET" : "POST",
        headers: {
          "x-querypad-bridge-token": t.token,
          ...(body !== null && { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }),
        },
        signal,
        // A fresh connection: the default keep-alive agent's ~5 s idle timeout would cut off
        // CLIs that think for a while before their first output.
        agent: false,
        timeout: timeoutMs,
      },
      resolve
    );
    req.on("timeout", () => req.destroy(new Error("The local AI bridge didn't respond.")));
    req.on("error", (err) =>
      reject(Object.assign(new Error(signal?.aborted ? "Stopped." : `Local AI bridge unreachable: ${err.message}`), { status: 503 }))
    );
    req.end(body ?? undefined);
  });
}

async function readAll(res: IncomingMessage): Promise<string> {
  let text = "";
  for await (const chunk of res) text += chunk.toString("utf8");
  return text;
}

/** Bridge model ids that are installed and ready (cached briefly; [] when no bridge). */
export async function availableBridgeModels(): Promise<string[]> {
  if (!target()) return [];
  if (!cached || Date.now() - cached.at > HEALTH_TTL_MS) {
    cached = {
      at: Date.now(),
      models: call("/health", null, undefined, 3000)
        .then(async (res) => (res.statusCode === 200 ? ((JSON.parse(await readAll(res)) as { models?: BridgeModel[] }).models ?? []) : []))
        .catch(() => []),
    };
  }
  return (await cached.models).filter((m) => m.available).map((m) => m.id);
}

/** Stream plain-text deltas from a bridge model. Throws with the bridge's message on failure. */
export async function* streamFromBridge(options: {
  model: string;
  effort?: AiEffort;
  system: string;
  input: string;
  history: ChatTurn[];
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const { signal, ...payload } = options;
  // The bridge itself stops a CLI after 180 s; allow a little more before giving up here.
  const res = await call("/complete", JSON.stringify(payload), signal, 200_000);
  if (res.statusCode !== 200) {
    let message = `Local AI bridge error (HTTP ${res.statusCode}).`;
    try {
      message = (JSON.parse(await readAll(res)) as { error?: string }).error ?? message;
    } catch {
      // keep the generic message
    }
    throw Object.assign(new Error(message), { status: res.statusCode === 401 ? 502 : res.statusCode });
  }
  res.setEncoding("utf8");
  try {
    for await (const chunk of res) yield chunk as string;
  } finally {
    res.destroy();
  }
}
