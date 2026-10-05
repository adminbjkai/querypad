import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { complete, parseSse, streamComplete } from "../src/lib/ai/complete";
import { AI_PROVIDER_IDS, getAiProviderConfig, isAiProvider } from "../src/lib/ai/providers";
import { resolveAiCredentials } from "../src/cli/ai-env";
import { GET, POST } from "../src/app/api/complete/route";

// ---- helpers ------------------------------------------------------------------

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

function sse(events: unknown[], done = true): string[] {
  const out = events.map((e) => `data: ${JSON.stringify(e)}\n\n`);
  if (done) out.push("data: [DONE]\n\n");
  return out;
}

interface Call {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(respond: (call: Call) => Response): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {}, body: JSON.parse(String(init?.body ?? "{}")) };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return calls;
}

async function collect(gen: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const x of gen) out.push(x);
  return out;
}

const chatEvents = sse([
  { choices: [{ delta: { role: "assistant" } }] },
  { choices: [{ delta: { content: "SELECT " } }] },
  { choices: [{ delta: { content: "1" } }] },
]);

// ---- SSE parser -----------------------------------------------------------------

test("parseSse handles split chunks, CRLF, comments, multi-line data and trailing event", async () => {
  const data = await collect(
    parseSse(
      streamOf([
        ": keep-alive\n\nevent: x\nda",
        "ta: {\"a\":1}\r\n\r\ndata: line1\ndata:line2\n\n",
        "data: tail-without-blank-line",
      ])
    )
  );
  assert.deepEqual(data, ['{"a":1}', "line1\nline2", "tail-without-blank-line"]);
});

test("parseSse cancels the body when the consumer stops early", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new TextEncoder().encode("data: x\n\n"));
    },
    cancel() {
      cancelled = true;
    },
  });
  for await (const d of parseSse(body)) {
    assert.equal(d, "x");
    break;
  }
  assert.ok(cancelled);
});

// ---- Provider table ---------------------------------------------------------------

test("provider table is consistent", () => {
  for (const id of AI_PROVIDER_IDS) {
    const c = getAiProviderConfig(id);
    assert.equal(c.id, id);
    assert.match(c.envKey, /^[A-Z_]+_API_KEY$/);
    assert.match(c.baseUrl, /^https:\/\//);
    assert.ok(isAiProvider(id));
  }
  assert.ok(!isAiProvider("nope"));
  assert.ok(!isAiProvider(null));
});

// ---- Wire routing (mocked fetch) ---------------------------------------------------

for (const id of ["groq", "ollama", "openrouter", "xai"] as const) {
  test(`${id} streams via OpenAI-compatible chat completions`, async () => {
    const config = getAiProviderConfig(id);
    const calls = mockFetch(() => new Response(streamOf(chatEvents)));
    const controller = new AbortController();
    const out = await collect(
      streamComplete({ provider: id, apiKey: "k", system: "sys", input: "in", maxTokens: 50, signal: controller.signal })
    );
    assert.deepEqual(out, ["SELECT ", "1"]);
    assert.equal(calls[0].url, `${config.baseUrl}/chat/completions`);
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer k");
    assert.equal(calls[0].init.signal, controller.signal);
    assert.equal(calls[0].body.model, config.model);
    assert.equal(calls[0].body.max_tokens, 50);
    assert.deepEqual(calls[0].body.messages, [
      { role: "system", content: "sys" },
      { role: "user", content: "in" },
    ]);
    for (const [k, v] of Object.entries(config.extraBody ?? {})) assert.deepEqual(calls[0].body[k], v);
  });
}

test("anthropic streams via the Messages API", async () => {
  const calls = mockFetch(
    () =>
      new Response(
        streamOf(
          sse(
            [
              { type: "message_start" },
              { type: "content_block_delta", delta: { type: "text_delta", text: "SELECT" } },
              { type: "content_block_delta", delta: { type: "text_delta", text: " 1" } },
              { type: "message_stop" },
            ],
            false
          )
        )
      )
  );
  assert.equal(await complete({ provider: "anthropic", apiKey: "k", system: "s", input: "i" }), "SELECT 1");
  assert.equal(calls[0].url, "https://api.anthropic.com/v1/messages");
  assert.equal((calls[0].init.headers as Record<string, string>)["x-api-key"], "k");
  assert.equal(calls[0].body.model, "claude-sonnet-5-5");
  assert.equal(calls[0].body.system, "s");
  assert.equal(calls[0].body.max_tokens, 1024);
});

test("openai streams via the Responses API and surfaces response.failed", async () => {
  const calls = mockFetch(
    () =>
      new Response(
        streamOf(sse([{ type: "response.output_text.delta", delta: "SELECT 1" }, { type: "response.completed" }]))
      )
  );
  assert.equal(await complete({ provider: "openai", apiKey: "k", system: "s", input: "i" }), "SELECT 1");
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(calls[0].body.instructions, "s");

  mockFetch(() => new Response(streamOf(sse([{ type: "response.failed", response: { error: { message: "boom" } } }]))));
  await assert.rejects(complete({ provider: "openai", apiKey: "k", system: "s", input: "i" }), /boom/);
});

test("mid-stream error events are thrown", async () => {
  mockFetch(() => new Response(streamOf(sse([{ error: { message: "upstream overloaded" } }]))));
  await assert.rejects(complete({ provider: "openrouter", apiKey: "k", system: "s", input: "i" }), /upstream overloaded/);
});

test("HTTP errors are mapped consistently", async () => {
  mockFetch(() => new Response("nope", { status: 401 }));
  await assert.rejects(complete({ provider: "xai", apiKey: "k", system: "s", input: "i" }), /Invalid API key/);

  mockFetch(() => new Response("slow down", { status: 429 }));
  await assert.rejects(complete({ provider: "groq", apiKey: "k", system: "s", input: "i" }), /Rate limit/);

  mockFetch(() => Response.json({ error: { message: "model not found" } }, { status: 404 }));
  await assert.rejects(complete({ provider: "ollama", apiKey: "k", system: "s", input: "i" }), (err: Error & { status?: number }) => {
    assert.equal(err.message, "model not found");
    assert.equal(err.status, 404);
    return true;
  });

  mockFetch(() => Response.json({ code: "x", error: "bad credentials" }, { status: 403 }));
  await assert.rejects(complete({ provider: "xai", apiKey: "k", system: "s", input: "i" }), /bad credentials/);
});

test("abort signal cancels the request", async () => {
  mockFetch((call) => {
    const signal = call.init.signal!;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(chatEvents[1]));
        signal.addEventListener("abort", () => controller.error(signal.reason));
      },
    });
    return new Response(body);
  });
  const controller = new AbortController();
  const seen: string[] = [];
  await assert.rejects(
    (async () => {
      for await (const chunk of streamComplete({ provider: "groq", apiKey: "k", system: "s", input: "i", signal: controller.signal })) {
        seen.push(chunk);
        controller.abort();
      }
    })(),
    { name: "AbortError" }
  );
  assert.deepEqual(seen, ["SELECT "]);
});

test("Node without an apiKey throws naming the env var (no relative /api fetch)", async () => {
  const calls = mockFetch(() => new Response(""));
  await assert.rejects(complete({ provider: "xai", system: "s", input: "i" }), /XAI_API_KEY/);
  assert.equal(calls.length, 0);
});

// ---- CLI credential resolution -------------------------------------------------------

async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T | Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test("resolveAiCredentials: flag > QUERYPAD_AI_PROVIDER > default, key from table env var", async () => {
  await withEnv({ QUERYPAD_AI_PROVIDER: "ollama", OLLAMA_API_KEY: "o", XAI_API_KEY: "x", GROQ_API_KEY: "g" }, () => {
    assert.deepEqual(resolveAiCredentials("xai"), { provider: "xai", apiKey: "x" });
    assert.deepEqual(resolveAiCredentials(), { provider: "ollama", apiKey: "o" });
  });
  await withEnv({ QUERYPAD_AI_PROVIDER: undefined, GROQ_API_KEY: "g" }, () => {
    assert.deepEqual(resolveAiCredentials(), { provider: "groq", apiKey: "g" });
  });
  await withEnv({ OPENROUTER_API_KEY: undefined }, () => {
    assert.throws(() => resolveAiCredentials("openrouter"), /OPENROUTER_API_KEY/);
  });
  assert.throws(() => resolveAiCredentials("bogus"), /anthropic, openai, groq, ollama, openrouter, xai/);
});

// ---- /api/complete route (mocked upstream) ----------------------------------------------

function post(body: unknown): Request {
  return new Request("http://localhost/api/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ALL_KEYS_UNSET = Object.fromEntries(AI_PROVIDER_IDS.map((id) => [getAiProviderConfig(id).envKey, undefined]));

test("GET /api/complete lists only providers with a server key", async () => {
  await withEnv({ ...ALL_KEYS_UNSET, XAI_API_KEY: "x", OLLAMA_API_KEY: "o", GROQ_API_KEY: "" }, async () => {
    const res = await GET();
    assert.deepEqual(await res.json(), { providers: ["ollama", "xai"] });
  });
});

test("POST /api/complete validates input", async () => {
  await withEnv({ ...ALL_KEYS_UNSET, XAI_API_KEY: "x" }, async () => {
    assert.equal((await POST(post({ provider: "nope", system: "", input: "" }))).status, 400);
    assert.equal((await POST(post({ provider: "xai", system: 1, input: "" }))).status, 400);
    assert.equal((await POST(post({ provider: "xai", system: "", input: "x".repeat(200_001) }))).status, 413);
    const unconfigured = await POST(post({ provider: "groq", system: "", input: "hi" }));
    assert.equal(unconfigured.status, 400);
    assert.match(await unconfigured.text(), /not configured/);
  });
});

test("POST /api/complete streams plain text with the server key and clamps maxTokens", async () => {
  await withEnv({ ...ALL_KEYS_UNSET, XAI_API_KEY: "server-key" }, async () => {
    const calls = mockFetch(() => new Response(streamOf(chatEvents)));
    const res = await POST(post({ provider: "xai", system: "s", input: "i", maxTokens: 99_999 }));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("X-Accel-Buffering"), "no");
    assert.equal(await res.text(), "SELECT 1");
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer server-key");
    assert.equal(calls[0].body.max_tokens, 4096);
  });
});

test("POST /api/complete propagates upstream error status and message", async () => {
  await withEnv({ ...ALL_KEYS_UNSET, OPENROUTER_API_KEY: "k" }, async () => {
    mockFetch(() => Response.json({ error: { message: "No endpoints found" } }, { status: 404 }));
    const res = await POST(post({ provider: "openrouter", system: "s", input: "i" }));
    assert.equal(res.status, 404);
    assert.equal(await res.text(), "No endpoints found");
  });
});

test("route refuses cross-site and non-JSON requests", async () => {
  const body = JSON.stringify({ provider: "openrouter", system: "s", input: "i" });
  const req = (headers: Record<string, string>) =>
    new Request("http://app.test/api/complete", { method: "POST", body, headers });

  // A form-style post from another site can't spend the server's key.
  assert.equal((await POST(req({ "content-type": "text/plain" }))).status, 403);
  assert.equal(
    (await POST(req({ "content-type": "application/json", origin: "https://evil.example", host: "app.test" }))).status,
    403
  );
  assert.equal(
    (await POST(req({ "content-type": "application/json", "sec-fetch-site": "cross-site", host: "app.test" }))).status,
    403
  );
});
