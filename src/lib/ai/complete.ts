import type { AiEffort, AiProvider, AiProviderConfig } from "./providers";
import { getAiProviderConfig } from "./providers";

/** One earlier conversation turn. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CompleteOptions {
  provider: AiProvider;
  /**
   * Provider API key. When absent in the browser, the request is proxied through
   * the server-managed `/api/complete` route; in Node it is required.
   */
  apiKey?: string;
  /** System prompt / instructions. */
  system: string;
  /** User input (already-assembled prompt) for the current turn. */
  input: string;
  /** Earlier conversation turns, oldest first (the current turn is `input`). */
  history?: ChatTurn[];
  /** Max output tokens (default 1024). */
  maxTokens?: number;
  /** Reasoning effort for models that offer a choice (local CLIs). */
  effort?: AiEffort;
  /** Cancels the in-flight HTTP request. */
  signal?: AbortSignal;
}

export const DEFAULT_MAX_TOKENS = 1024;

/** Error carrying the HTTP status of a failed provider/proxy response. */
export class AiHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AiHttpError";
    this.status = status;
  }
}

/** Map a failed response to a readable error (401/429 normalized, else JSON error message). */
async function responseError(response: Response): Promise<AiHttpError> {
  const { status } = response;
  if (status === 401) {
    return new AiHttpError("Invalid API key. Please check your key and try again.", status);
  }
  if (status === 429) {
    return new AiHttpError("Rate limit exceeded. Please wait a moment and try again.", status);
  }
  const body = await response.text().catch(() => "");
  let message = body;
  try {
    const parsed = JSON.parse(body) as {
      error?: string | { message?: string };
      message?: string;
    };
    const fromJson =
      typeof parsed.error === "string" ? parsed.error : parsed.error?.message ?? parsed.message;
    if (fromJson) message = fromJson;
  } catch {
    // not JSON: use the raw body
  }
  return new AiHttpError(message.trim() || `HTTP ${status}`, status);
}

/**
 * Parse a Server-Sent Events byte stream, yielding each event's `data` payload
 * (multi-line data joined with "\n"). Cancels the body if the consumer stops early.
 */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let data: string[] = [];
  let finished = false;

  function* flushLine(line: string): Generator<string> {
    if (line === "") {
      if (data.length > 0) yield data.join("\n");
      data = [];
    } else if (line.startsWith("data:")) {
      const value = line.slice(5);
      data.push(value.startsWith(" ") ? value.slice(1) : value);
    }
    // other fields (event:, id:, retry:) and comments (:...) are ignored
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r\n|\r|\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) yield* flushLine(line);
    }
    if (buffer) yield* flushLine(buffer);
    yield* flushLine("");
  } finally {
    if (!finished) await reader.cancel().catch(() => {});
  }
}

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal | undefined
): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw await responseError(response);
  if (!response.body) throw new Error("No response body");
  return response.body;
}

function parseEvent(data: string): Record<string, unknown> | null {
  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function eventErrorMessage(event: Record<string, unknown>): string | null {
  const error = event.error as { message?: string } | string | undefined;
  if (!error) return null;
  return typeof error === "string" ? error : error.message || "Provider stream error.";
}

type WireOptions = CompleteOptions & { apiKey: string };

/** Earlier turns plus the current user input, as plain {role, content} messages. */
function conversation(o: CompleteOptions): ChatTurn[] {
  const history = (o.history ?? []).map(({ role, content }) => ({ role, content }));
  return [...history, { role: "user", content: o.input }];
}

/** Anthropic Messages API (SSE). */
async function* streamAnthropic(config: AiProviderConfig, o: WireOptions): AsyncGenerator<string> {
  const body = await post(
    `${config.baseUrl}/messages`,
    {
      "x-api-key": o.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    {
      model: config.model,
      max_tokens: o.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream: true,
      system: o.system,
      messages: conversation(o),
      ...config.extraBody,
    },
    o.signal
  );
  for await (const data of parseSse(body)) {
    const event = parseEvent(data);
    if (!event) continue;
    if (event.type === "error") throw new Error(eventErrorMessage(event) ?? "Anthropic stream error.");
    const delta = event.delta as { type?: string; text?: string } | undefined;
    if (event.type === "content_block_delta" && delta?.type === "text_delta" && delta.text) {
      yield delta.text;
    }
  }
}

/** OpenAI Responses API (SSE). */
async function* streamOpenAiResponses(
  config: AiProviderConfig,
  o: WireOptions
): AsyncGenerator<string> {
  const body = await post(
    `${config.baseUrl}/responses`,
    { Authorization: `Bearer ${o.apiKey}` },
    {
      model: config.model,
      instructions: o.system,
      input: o.history?.length ? conversation(o) : o.input,
      max_output_tokens: o.maxTokens ?? DEFAULT_MAX_TOKENS,
      reasoning: { effort: "low" },
      stream: true,
      store: false,
      text: { format: { type: "text" }, verbosity: "low" },
      ...config.extraBody,
    },
    o.signal
  );
  for await (const data of parseSse(body)) {
    if (data === "[DONE]") return;
    const event = parseEvent(data);
    if (!event) continue;
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      yield event.delta;
    } else if (event.type === "response.failed") {
      const response = event.response as { error?: { message?: string } } | undefined;
      throw new Error(response?.error?.message || "OpenAI response failed.");
    } else if (event.type === "error") {
      throw new Error(eventErrorMessage(event) ?? "OpenAI stream error.");
    }
  }
}

/** Generic OpenAI-compatible Chat Completions (SSE): Groq, Ollama Cloud, OpenRouter, xAI. */
async function* streamChatCompletions(
  config: AiProviderConfig,
  o: WireOptions
): AsyncGenerator<string> {
  const body = await post(
    `${config.baseUrl}/chat/completions`,
    { Authorization: `Bearer ${o.apiKey}` },
    {
      model: config.model,
      max_tokens: o.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream: true,
      messages: [{ role: "system", content: o.system }, ...conversation(o)],
      ...config.extraBody,
    },
    o.signal
  );
  for await (const data of parseSse(body)) {
    if (data === "[DONE]") return;
    const event = parseEvent(data);
    if (!event) continue;
    const error = eventErrorMessage(event);
    if (error) throw new Error(error);
    const choices = event.choices as { delta?: { content?: string | null } }[] | undefined;
    const content = choices?.[0]?.delta?.content;
    if (content) yield content;
  }
}

/** Browser path for server-managed providers: the server holds the key and streams plain text. */
async function* streamViaServer(o: CompleteOptions): AsyncGenerator<string> {
  const response = await fetch("/api/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: o.provider,
      system: o.system,
      input: o.input,
      history: o.history?.length ? o.history : undefined,
      maxTokens: o.maxTokens ?? DEFAULT_MAX_TOKENS,
      effort: o.effort,
    }),
    signal: o.signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new AiHttpError(text.trim() || `HTTP ${response.status}`, response.status);
  }
  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let finished = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        const tail = decoder.decode();
        if (tail) yield tail;
        return;
      }
      const text = decoder.decode(value, { stream: true });
      if (text) yield text;
    }
  } finally {
    if (!finished) await reader.cancel().catch(() => {});
  }
}

/** Provider-routed streaming completion. Yields text deltas as they arrive. */
export async function* streamComplete(options: CompleteOptions): AsyncGenerator<string> {
  const config = getAiProviderConfig(options.provider);
  const { apiKey } = options;

  // Local CLIs are reached through the server route (which talks to the host bridge).
  if (config.kind === "local") {
    if (typeof window !== "undefined") {
      yield* streamViaServer(options);
      return;
    }
    throw new Error(`${config.label} runs through the QueryPad server's local AI bridge.`);
  }

  if (!apiKey) {
    if (typeof window !== "undefined") {
      yield* streamViaServer(options);
      return;
    }
    throw new Error(`Missing API key for ${config.label}. Set ${config.envKey} in your environment.`);
  }

  const wire = { ...options, apiKey };
  switch (config.kind) {
    case "anthropic":
      yield* streamAnthropic(config, wire);
      return;
    case "openai-responses":
      yield* streamOpenAiResponses(config, wire);
      return;
    case "openai-compatible":
      yield* streamChatCompletions(config, wire);
      return;
  }
}

/** Convenience: collect a streamed completion into a single string. */
export async function complete(options: CompleteOptions): Promise<string> {
  let out = "";
  for await (const chunk of streamComplete(options)) out += chunk;
  return out;
}
