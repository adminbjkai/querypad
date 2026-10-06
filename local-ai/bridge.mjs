#!/usr/bin/env node
// QueryPad local AI bridge: lets the QueryPad server use AI CLIs that are already signed in
// on this machine (Claude Code, Codex, Grok, Cursor) — no API keys. Runs on the host as the
// user who owns those logins; QueryPad's container reaches it over the Docker bridge.
//
// Every CLI runs inside bubblewrap (sandbox.mjs) with tools disabled where the CLI allows it,
// in an empty scratch dir, so prompt text (which includes your data's schema) can't make an
// agent touch the host. Requests need the shared token; plain Node, no dependencies.
//
//   QUERYPAD_BRIDGE_TOKEN   required shared secret (same value in QueryPad's env)
//   QUERYPAD_BRIDGE_SOCKET  Unix socket path to listen on (preferred: no network listener;
//                           the folder is mounted into the QueryPad container)
//   QUERYPAD_BRIDGE_HOST / QUERYPAD_BRIDGE_PORT   TCP instead (default 127.0.0.1:8062)
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { cliExecutable, sandboxArgs } from "./sandbox.mjs";

const TOKEN = process.env.QUERYPAD_BRIDGE_TOKEN ?? "";
const SOCKET = process.env.QUERYPAD_BRIDGE_SOCKET || "";
const HOST = process.env.QUERYPAD_BRIDGE_HOST || "127.0.0.1";
const PORT = Number(process.env.QUERYPAD_BRIDGE_PORT || 8062);
const MAX_CONCURRENT = 3;
const TIMEOUT_MS = 180_000;
const MAX_LINE_CHARS = 8_000_000;
const MAX_BODY = 400_000;

if (TOKEN.length < 24) {
  console.error("QUERYPAD_BRIDGE_TOKEN must be set (at least 24 characters).");
  process.exit(1);
}

/** The models QueryPad offers. `efforts` empty = the model name already fixes the effort. */
export const MODELS = [
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", vendor: "Claude", cli: "claude", model: "claude-sonnet-5-5", efforts: ["low", "medium"] },
  { id: "codex-gpt-6-luna", label: "GPT-6 Luna", vendor: "Codex", cli: "codex", model: "gpt-6-luna", efforts: ["low", "medium"] },
  { id: "grok-4-7", label: "Grok 4.7", vendor: "Grok", cli: "grok", model: "grok-4.7", efforts: ["low", "medium"] },
  { id: "cursor-grok-4-7-medium-fast", label: "Grok 4.7 Medium Fast", vendor: "Cursor", cli: "cursor", model: "grok-4.7-medium-fast", efforts: [] },
  { id: "cursor-composer-2-5", label: "Composer 2.5", vendor: "Cursor", cli: "cursor", model: "composer-2.5", efforts: [] },
];

const CODEX_LOCKDOWN = [
  "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config",
  "-c", "features.shell_tool=false", "-c", "features.browser_use=false", "-c", "features.computer_use=false",
  "-c", "features.apps=false", "-c", "features.code_mode_host=false", "-c", "web_search=disabled",
];

/** CLI arguments + how its stdout is parsed. The prompt goes in via stdin or a file. */
function command(spec, effort, work, promptFile, systemFile) {
  switch (spec.cli) {
    case "claude":
      return {
        args: ["-p", "--model", spec.model, "--effort", effort, "--tools", "", "--strict-mcp-config",
          "--setting-sources", "", "--no-session-persistence", "--system-prompt-file", systemFile,
          "--output-format", "stream-json", "--include-partial-messages", "--verbose"],
        stdin: true, parse: "anthropic-events",
      };
    case "grok":
      return {
        args: ["--prompt-file", promptFile, "-m", spec.model, "--reasoning-effort", effort, "--tools", "",
          "--permission-mode", "dontAsk", "--disable-web-search", "--max-turns", "1", "--cwd", work,
          "--output-format", "streaming-messages-json", "--include-partial-messages"],
        stdin: false, parse: "anthropic-events",
      };
    case "codex":
      return {
        args: ["exec", "-m", spec.model, "-c", `model_reasoning_effort=${effort}`, ...CODEX_LOCKDOWN, "-C", work, "-"],
        stdin: true, parse: "text",
      };
    case "cursor":
      return {
        args: ["-p", "--output-format", "stream-json", "--stream-partial-output", "--model", spec.model,
          "--mode", "ask", "--trust", "--workspace", work],
        stdin: true, parse: "cursor-events",
      };
    default:
      throw new Error(`unknown cli ${spec.cli}`);
  }
}

/** One conversation as a single prompt (the CLIs are single-turn). */
function buildPrompt(system, history, input, inlineSystem) {
  const parts = [];
  if (inlineSystem) parts.push(`<instructions>\n${system}\n</instructions>`);
  if (history.length > 0) {
    parts.push(
      "<conversation_so_far>\n" +
        history.map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`).join("\n\n") +
        "\n</conversation_so_far>"
    );
  }
  parts.push(history.length > 0 ? `User: ${input}` : input);
  return parts.join("\n\n");
}

/** Turn a line of CLI output into answer text (or nothing). */
function makeParser(kind) {
  let streamed = "";
  return (line) => {
    if (kind === "text") return line + "\n";
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return "";
    }
    if (kind === "anthropic-events") {
      const delta = event.type === "stream_event" ? event.event?.delta : null;
      if (delta?.type === "text_delta") return delta.text ?? "";
      return "";
    }
    // cursor: partial "assistant" chunks carry timestamp_ms; a final un-stamped one repeats them all.
    if (event.type === "assistant") {
      const text = (event.message?.content ?? []).map((c) => (c.type === "text" ? c.text : "")).join("");
      if (event.timestamp_ms !== undefined) {
        streamed += text;
        return text;
      }
      return streamed ? "" : text;
    }
    return "";
  };
}

let running = 0;

function authorized(req) {
  const given = Buffer.from(String(req.headers["x-querypad-bridge-token"] ?? ""));
  const want = Buffer.from(TOKEN);
  return given.length === want.length && timingSafeEqual(given, want);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("Request too large."));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function catalog() {
  return MODELS.map(({ id, label, vendor, efforts, cli }) => {
    let available = false;
    try {
      available = existsSync(cliExecutable(cli));
    } catch {
      available = false;
    }
    return { id, label, vendor, efforts, available };
  });
}

async function complete(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (err) {
    return send(res, 400, { error: err instanceof Error ? err.message : "Bad JSON." });
  }
  const spec = MODELS.find((m) => m.id === body?.model);
  if (!spec) return send(res, 400, { error: "Unknown model." });
  const effort = spec.efforts.length === 0 ? null : spec.efforts.includes(body.effort) ? body.effort : spec.efforts[0];
  const history = Array.isArray(body.history)
    ? body.history.filter((t) => (t?.role === "user" || t?.role === "assistant") && typeof t.content === "string")
    : [];
  if (typeof body.system !== "string" || typeof body.input !== "string") {
    return send(res, 400, { error: "system and input must be strings." });
  }
  if (running >= MAX_CONCURRENT) return send(res, 429, { error: "The local AI is busy with other requests — try again in a moment." });

  running += 1;
  let work;
  let child;
  try {
    work = mkdtempSync(path.join(tmpdir(), "qpai-"));
    const inlineSystem = spec.cli !== "claude";
    const prompt = buildPrompt(body.system, history, body.input, inlineSystem);
    const promptFile = path.join(work, "prompt.txt");
    const systemFile = path.join(work, "system.txt");
    writeFileSync(promptFile, prompt);
    writeFileSync(systemFile, body.system);
    const cmd = command(spec, effort, work, promptFile, systemFile);
    child = spawn("bwrap", [...sandboxArgs(spec.cli, work), cliExecutable(spec.cli), ...cmd.args], {
      stdio: [cmd.stdin ? "pipe" : "ignore", "pipe", "pipe"],
    });
    child.parse = cmd.parse;
    if (cmd.stdin) {
      // The CLI may exit (or be killed on cancel) before reading everything: ignore EPIPE.
      child.stdin.on("error", () => {});
      child.stdin.end(prompt);
    }
  } catch (err) {
    running -= 1;
    if (work) rmSync(work, { recursive: true, force: true });
    console.error(`[${spec.id}] failed to start: ${err instanceof Error ? err.message : err}`);
    return send(res, 502, { error: `${spec.vendor} CLI couldn't start on the server.` });
  }

  let headersSent = false;
  let stderr = "";
  let produced = false;
  const parse = makeParser(child.parse);
  const startStream = () => {
    if (headersSent) return;
    headersSent = true;
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
  };

  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    // A CLI that never ends a line would grow this without bound: stop it instead.
    if (buffer.length > MAX_LINE_CHARS) {
      buffer = "";
      child.kill("SIGKILL");
    }
    for (const line of lines) {
      const text = parse(line);
      if (text) {
        startStream();
        produced = true;
        res.write(text);
      }
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString("utf8")).slice(-4000);
  });

  const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
  // Client went away (user cancelled): stop the CLI.
  res.on("close", () => {
    if (child.exitCode === null) child.kill("SIGKILL");
  });

  let finished = false;
  const finish = () => {
    if (finished) return false;
    finished = true;
    clearTimeout(timer);
    running -= 1;
    rmSync(work, { recursive: true, force: true });
    return true;
  };
  // spawn failures (e.g. bwrap missing) arrive here instead of "close".
  child.on("error", (err) => {
    if (!finish()) return;
    console.error(`[${spec.id}] process error: ${err.message}`);
    if (!headersSent) send(res, 502, { error: `${spec.vendor} CLI couldn't run on the server.` });
    else res.end();
  });

  child.on("close", (code) => {
    if (!finish()) return;
    if (buffer) {
      const text = parse(buffer);
      if (text) {
        startStream();
        produced = true;
        res.write(text);
      }
    }
    if (!produced) {
      const detail = stderr.trim().split("\n").slice(-3).join(" ").slice(0, 400);
      console.error(`[${spec.id}] exit ${code}: ${detail}`);
      if (!headersSent) {
        return send(res, 502, {
          error: code === null ? `${spec.vendor} took too long to answer.` : `${spec.vendor} CLI failed${detail ? `: ${detail}` : "."}`,
        });
      }
    }
    res.end();
  });
}

const server = createServer((req, res) => {
  if (!authorized(req)) return send(res, 401, { error: "Unauthorized." });
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, models: catalog() });
  if (req.method === "POST" && req.url === "/complete") {
    complete(req, res).catch((err) => {
      console.error("complete failed:", err);
      if (!res.headersSent) send(res, 500, { error: "Local AI bridge error." });
      else res.end();
    });
    return;
  }
  send(res, 404, { error: "Not found." });
});

if (SOCKET) {
  mkdirSync(path.dirname(SOCKET), { recursive: true });
  if (existsSync(SOCKET)) unlinkSync(SOCKET);
  server.listen(SOCKET, () => {
    chmodSync(SOCKET, 0o600);
    console.log(`QueryPad local AI bridge on unix:${SOCKET}`);
  });
} else {
  server.listen(PORT, HOST, () => console.log(`QueryPad local AI bridge on http://${HOST}:${PORT}`));
}
