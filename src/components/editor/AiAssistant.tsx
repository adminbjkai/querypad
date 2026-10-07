"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { streamComplete, type ChatTurn } from "@/lib/ai/complete";
import {
  WORKSPACE_SQL_SYSTEM_PROMPT,
  buildTurnInput,
  buildWorkspaceContext,
  cleanSql,
  threadToHistory,
} from "@/lib/ai/workspace-context";
import { relationshipKey } from "@/lib/discovery/relationships";
import { insertAtCursor } from "@/lib/editor-bridge";
import { copyText } from "@/lib/export/clipboard";
import { getApiKey, setApiKey, clearApiKey } from "@/lib/ai/api-key";
import { getAiProviderConfig } from "@/lib/ai/providers";
import { useAiStore, currentEffort } from "@/stores/ai-store";
import ModelPicker from "@/components/ai/ModelPicker";
import type { AiTurn } from "@/types";
import { Icon } from "@/components/ui/icons";
import { Spinner, btn, input } from "@/components/ui/primitives";

/** Assemble the current workspace context (tables, profiles, joins, run log, editor). */
function currentContext(): string {
  const ws = useWorkspaceStore.getState();
  const tab = ws.tabs.find((t) => t.id === ws.activeTabId);
  return buildWorkspaceContext({
    tables: ws.tables,
    views: ws.views,
    profiles: Object.fromEntries(Object.entries(ws.tableProfiles).map(([name, p]) => [name, p.profile])),
    relationships: ws.discovery.relationships,
    verdicts: ws.relationshipVerdicts,
    relationshipKey,
    log: ws.history,
    editorQuery: tab?.query ?? "",
    editorError: tab?.error?.message ?? null,
  });
}

function CheckBadge({ turn }: { turn: AiTurn }) {
  if (turn.check === "ok") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-ok" title="Compiled against your current tables without running it">
        <Icon name="check" size={12} /> compiles
      </span>
    );
  }
  if (turn.check === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-danger" title={turn.checkError}>
        <Icon name="alert" size={12} /> doesn&apos;t compile
      </span>
    );
  }
  return <span className="text-[11px] text-faint">not checked</span>;
}

export default function AiAssistant() {
  const seed = useUiStore((s) => s.aiSeed);
  const closeAi = useUiStore((s) => s.closeAi);
  const toast = useUiStore((s) => s.toast);
  const tabId = useWorkspaceStore((s) => s.activeTabId);
  const thread = useWorkspaceStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.aiThread);
  const appendAiTurn = useWorkspaceStore((s) => s.appendAiTurn);
  const clearAiThread = useWorkspaceStore((s) => s.clearAiThread);
  const updateTab = useWorkspaceStore((s) => s.updateTab);
  const runQuery = useWorkspaceStore((s) => s.runQuery);
  const tableCount = useWorkspaceStore((s) => s.tables.length + s.views.length);
  const joinCount = useWorkspaceStore(
    (s) => s.discovery.relationships.filter((r) => s.relationshipVerdicts[relationshipKey(r)] !== "rejected").length
  );
  const runCount = useWorkspaceStore((s) => Math.min(s.history.length, 8));

  const provider = useAiStore((s) => s.provider);
  const serverProviders = useAiStore((s) => s.serverProviders);
  // Bumped when the stored key changes so the memo re-reads it.
  const [keyVersion, setKeyVersion] = useState(0);
  const userKey = useMemo(() => (keyVersion >= 0 ? getApiKey(provider) : null), [provider, keyVersion]);
  const [keyDraft, setKeyDraft] = useState("");
  const [editingKey, setEditingKey] = useState(false);
  const [prompt, setPrompt] = useState(seed ?? "");
  const [pending, setPending] = useState("");
  const [streaming, setStreaming] = useState("");
  const [phase, setPhase] = useState<"idle" | "writing" | "checking" | "repairing">("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const turns = useMemo(() => thread ?? [], [thread]);
  const config = getAiProviderConfig(provider);
  const isLocal = config.kind === "local";
  const serverManaged = serverProviders.includes(provider);
  const ready = serverManaged || !!userKey;
  const busy = phase !== "idle";

  useEffect(() => {
    void useAiStore.getState().init();
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (seed) setPrompt(seed);
    promptRef.current?.focus();
  }, [seed]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [turns.length, streaming]);

  /** Stream one completion into the live preview; returns the cleaned SQL. */
  const ask = useCallback(
    async (input: string, history: ChatTurn[], signal: AbortSignal) => {
      let text = "";
      setStreaming("");
      for await (const chunk of streamComplete({
        provider,
        apiKey: serverManaged ? undefined : userKey ?? undefined,
        effort: currentEffort(),
        system: WORKSPACE_SQL_SYSTEM_PROMPT,
        input,
        history,
        maxTokens: 2048,
        signal,
      })) {
        text += chunk;
        setStreaming(text);
      }
      return cleanSql(text);
    },
    [provider, serverManaged, userKey]
  );

  const generate = useCallback(async () => {
    const request = prompt.trim();
    if (!request || busy || !ready) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setPending(request);
    setPrompt("");
    const history = threadToHistory(turns);
    try {
      setPhase("writing");
      let sql = await ask(buildTurnInput(currentContext(), request), history, controller.signal);
      if (!sql) throw new Error("The model returned an empty answer. Try rephrasing.");

      // Compile against the real tables; let the model fix its own mistake once.
      setPhase("checking");
      const { checkSql } = await import("@/lib/duckdb/validate");
      const stopped = () => {
        if (controller.signal.aborted) throw new DOMException("Stopped", "AbortError");
      };
      let check = await checkSql(sql);
      stopped();
      if (check.status === "failed") {
        setPhase("repairing");
        const fixed = await ask(
          buildTurnInput(currentContext(), `That SQL failed in DuckDB with this error:\n${check.error}\nReturn corrected SQL only.`),
          [...history, { role: "user", content: request }, { role: "assistant", content: sql }],
          controller.signal
        );
        if (fixed) {
          sql = fixed;
          check = await checkSql(sql);
        }
      }
      stopped();

      appendAiTurn(tabId, {
        id: crypto.randomUUID(),
        prompt: request,
        sql,
        at: Date.now(),
        check: check.status,
        checkError: check.status === "failed" ? check.error : undefined,
      });
    } catch (err) {
      setPrompt((current) => current || request);
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      if (/invalid api key/i.test(message) && !serverManaged) {
        clearApiKey(provider);
        setKeyVersion((v) => v + 1);
      }
    } finally {
      setPhase("idle");
      setStreaming("");
      setPending("");
      abortRef.current = null;
    }
  }, [prompt, busy, ready, turns, ask, appendAiTurn, tabId, serverManaged, provider]);

  const applySql = (sql: string, run: boolean) => {
    updateTab(tabId, { query: sql });
    if (run) void runQuery(tabId, sql);
  };

  const phaseLabel = {
    idle: "",
    writing: "Writing SQL…",
    checking: "Checking it compiles against your tables…",
    repairing: "It didn't compile — asking the model to fix it…",
  }[phase];

  return (
    <section className="qp-pop flex max-h-[55vh] shrink-0 flex-col border-b border-line bg-surface" aria-label="AI SQL assistant">
      {(turns.length > 0 || busy) && (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-2.5">
          <ol className="space-y-3" aria-label="Conversation">
            {turns.map((turn, i) => (
              <li key={turn.id} className="space-y-1.5" data-testid="ai-turn">
                <p className="ml-6 text-[13px] leading-5 text-ink">
                  <span className="mr-1.5 text-faint">You</span>
                  {turn.prompt}
                </p>
                <div className="ml-6 rounded-lg border border-line bg-raised">
                  <pre className="max-h-48 overflow-auto p-2.5 font-mono text-[12px] leading-[19px] text-ink">{turn.sql}</pre>
                  <div className="flex flex-wrap items-center gap-1 border-t border-line px-2 py-1">
                    <CheckBadge turn={turn} />
                    <span className="flex-1" />
                    <button onClick={() => applySql(turn.sql, true)} className={`${i === turns.length - 1 ? btn.primary : btn.secondary} h-7`}>
                      <Icon name="play" size={14} />
                      Use and run
                    </button>
                    <button onClick={() => applySql(turn.sql, false)} className={`${btn.ghost} h-7`}>
                      Replace query
                    </button>
                    <button onClick={() => insertAtCursor(turn.sql)} className={`${btn.ghost} h-7`}>
                      Insert
                    </button>
                    <button
                      onClick={() => void copyText(turn.sql).then(() => toast("SQL copied."))}
                      className={btn.icon}
                      aria-label="Copy SQL"
                      title="Copy SQL"
                    >
                      <Icon name="copy" size={14} />
                    </button>
                  </div>
                  {turn.check === "failed" && turn.checkError && (
                    <p className="border-t border-line px-2.5 py-1.5 text-[12px] text-danger">{turn.checkError}</p>
                  )}
                </div>
              </li>
            ))}
            {busy && (
              <li className="space-y-1.5">
                <p className="ml-6 text-[13px] leading-5 text-ink">
                  <span className="mr-1.5 text-faint">You</span>
                  {pending}
                </p>
                <div className="ml-6 rounded-lg border border-dashed border-line-strong bg-raised">
                  <pre className="max-h-48 overflow-auto p-2.5 font-mono text-[12px] leading-[19px] text-ink">
                    {cleanSql(streaming) || " "}
                    <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-accent" />
                  </pre>
                  <p className="flex items-center gap-1.5 border-t border-line px-2.5 py-1 text-[11px] text-muted">
                    <Spinner className="size-3 text-accent" />
                    {phaseLabel}
                  </p>
                </div>
              </li>
            )}
          </ol>
          <div ref={threadEndRef} />
        </div>
      )}

      <div className="shrink-0 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <Icon name="sparkle" className="mt-2 text-accent" />
          <textarea
            ref={promptRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void generate();
              }
              if (e.key === "Escape") closeAi();
            }}
            rows={Math.min(4, Math.max(1, prompt.split("\n").length))}
            placeholder={
              !ready
                ? "Add an API key below to start"
                : turns.length > 0
                  ? "Ask a follow-up, e.g. now only the Sales department"
                  : "Describe the result you want, e.g. every employee with their department"
            }
            className={`${input} h-auto min-h-8 resize-none py-1.5 leading-5`}
            aria-label="Describe the query"
            disabled={busy}
          />
          <div className="mt-0.5 shrink-0">
            <ModelPicker compact />
          </div>
          {busy ? (
            <button onClick={() => abortRef.current?.abort()} className={btn.secondary}>
              <Icon name="stop" size={14} />
              Stop
            </button>
          ) : (
            <button onClick={() => void generate()} disabled={!prompt.trim() || !ready} className={btn.primary}>
              Write SQL
            </button>
          )}
          <button onClick={closeAi} className={btn.icon} aria-label="Close AI assistant">
            <Icon name="x" />
          </button>
        </div>

        <div className="ml-6 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          <span title="Sent with every request: table schemas with column hints, inferred joins, your recent runs, and the editor's SQL">
            Knows {tableCount} {tableCount === 1 ? "table" : "tables"}, {joinCount} {joinCount === 1 ? "join" : "joins"} and your last{" "}
            {runCount} {runCount === 1 ? "run" : "runs"}
            {turns.length > 0 && `, plus ${turns.length} earlier ${turns.length === 1 ? "turn" : "turns"} in this tab`}
          </span>
          {turns.length > 0 && !busy && (
            <button onClick={() => clearAiThread(tabId)} className="text-accent hover:underline">
              New conversation
            </button>
          )}
        </div>

        <div className="ml-6 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          {isLocal ? (
            <span>
              {serverManaged
                ? `Runs through the ${config.label} CLI signed in on this server — no API key. Schemas, column hints and your SQL are sent to ${config.label}; table rows are not.`
                : `The ${config.label} CLI isn't available on this server right now. Pick another model.`}
            </span>
          ) : serverManaged ? (
            <span>
              Using the server&apos;s {config.label} key. Schemas, column hints and your SQL are sent to {config.label}; table rows are not.
            </span>
          ) : userKey && !editingKey ? (
            <>
              <span>Using your {config.label} key, stored only in this browser.</span>
              <button onClick={() => setEditingKey(true)} className="text-accent hover:underline">
                Change key
              </button>
            </>
          ) : (
            <form
              className="flex w-full max-w-xl items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const key = keyDraft.trim();
                if (!key) return;
                setApiKey(provider, key);
                setKeyVersion((v) => v + 1);
                setKeyDraft("");
                setEditingKey(false);
                setError(null);
              }}
            >
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder={config.keyPlaceholder}
                className={`${input} h-7 font-mono text-[12px]`}
                aria-label={`${config.label} API key`}
                autoComplete="off"
              />
              <button type="submit" disabled={!keyDraft.trim()} className={`${btn.secondary} h-7`}>
                Save key
              </button>
              <a href={config.keyUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-accent hover:underline">
                Get a key
              </a>
            </form>
          )}
        </div>

        {error && <p className="ml-6 mt-2 text-[12px] text-danger">{error}</p>}
      </div>
    </section>
  );
}
