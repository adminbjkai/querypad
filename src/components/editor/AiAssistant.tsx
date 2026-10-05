"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { generateSql } from "@/lib/ai/generate-sql";
import { buildAskContext } from "@/lib/agent/ask-context";
import { relationshipKey } from "@/lib/discovery/relationships";
import { insertAtCursor } from "@/lib/editor-bridge";
import {
  getStoredAiProvider,
  setAiProvider,
  getApiKey,
  setApiKey,
  clearApiKey,
  fetchServerProviders,
} from "@/lib/ai/api-key";
import { AI_PROVIDER_OPTIONS, DEFAULT_AI_PROVIDER, getAiProviderConfig, type AiProvider } from "@/lib/ai/providers";
import { Icon } from "@/components/ui/icons";
import { btn, input } from "@/components/ui/primitives";

/** Models occasionally wrap SQL in fences despite instructions; keep only the SQL. */
function cleanSql(text: string): string {
  return text.replace(/^\s*```(?:sql)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

export default function AiAssistant() {
  const seed = useUiStore((s) => s.aiSeed);
  const closeAi = useUiStore((s) => s.closeAi);
  const [provider, setProvider] = useState<AiProvider>(() => getStoredAiProvider() ?? DEFAULT_AI_PROVIDER);
  const [serverProviders, setServerProviders] = useState<AiProvider[]>([]);
  const [userKey, setUserKey] = useState<string | null>(() => getApiKey(getStoredAiProvider() ?? DEFAULT_AI_PROVIDER));
  const [keyDraft, setKeyDraft] = useState("");
  const [editingKey, setEditingKey] = useState(false);
  const [prompt, setPrompt] = useState(seed ?? "");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const config = getAiProviderConfig(provider);
  const serverManaged = serverProviders.includes(provider);
  const ready = serverManaged || !!userKey;

  // Pick the stored provider, else the first one the server has a key for.
  useEffect(() => {
    let cancelled = false;
    void fetchServerProviders().then((available) => {
      if (cancelled) return;
      setServerProviders(available);
      const chosen = getStoredAiProvider() ?? available[0] ?? DEFAULT_AI_PROVIDER;
      setProvider(chosen);
      setUserKey(getApiKey(chosen));
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (seed) setPrompt(seed);
    promptRef.current?.focus();
  }, [seed]);

  const chooseProvider = (next: AiProvider) => {
    setProvider(next);
    setAiProvider(next);
    setUserKey(getApiKey(next));
    setEditingKey(false);
    setError(null);
  };

  const generate = useCallback(async () => {
    const request = prompt.trim();
    if (!request || busy || !ready) return;
    const ws = useWorkspaceStore.getState();
    const tab = ws.tabs.find((t) => t.id === ws.activeTabId);
    const relationships = ws.discovery.relationships.filter(
      (rel) => ws.relationshipVerdicts[relationshipKey(rel)] !== "rejected"
    );
    let schema = buildAskContext({ tables: ws.tables, relationships });
    if (tab?.query.trim()) schema += `\n\nCurrent editor query:\n${tab.query.trim()}`;
    if (tab?.error) schema += `\n\nIt failed with: ${tab.error.message}`;

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setOutput("");
    setError(null);
    try {
      let text = "";
      for await (const chunk of generateSql({
        provider,
        apiKey: serverManaged ? undefined : userKey ?? undefined,
        prompt: request,
        schema,
        signal: controller.signal,
      })) {
        text += chunk;
        setOutput(text);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      if (/invalid api key/i.test(message) && !serverManaged) {
        clearApiKey(provider);
        setUserKey(null);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [prompt, busy, ready, provider, serverManaged, userKey]);

  const sql = cleanSql(output);
  const tabId = useWorkspaceStore((s) => s.activeTabId);
  const updateTab = useWorkspaceStore((s) => s.updateTab);
  const runQuery = useWorkspaceStore((s) => s.runQuery);

  const replace = (run: boolean) => {
    updateTab(tabId, { query: sql });
    if (run) void runQuery(tabId, sql);
    setOutput("");
    closeAi();
  };

  return (
    <section className="qp-pop shrink-0 border-b border-line bg-surface px-3 py-2.5" aria-label="AI SQL assistant">
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
          placeholder={ready ? "Describe the result you want, e.g. revenue by month for paid users" : "Add an API key below to start"}
          className={`${input} h-auto min-h-8 resize-none py-1.5 leading-5`}
          aria-label="Describe the query"
        />
        <select
          value={provider}
          onChange={(e) => chooseProvider(e.target.value as AiProvider)}
          className="h-8 max-w-[150px] shrink-0 rounded-md border border-line bg-surface px-1.5 text-[12px] text-ink outline-none focus:border-accent"
          aria-label="AI provider"
        >
          {AI_PROVIDER_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label} ({option.modelLabel})
            </option>
          ))}
        </select>
        {busy ? (
          <button onClick={() => abortRef.current?.abort()} className={btn.secondary}>
            <Icon name="stop" size={13} />
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
        {serverManaged ? (
          <span>Using the server&apos;s {config.label} key. Your schema and request are sent to {config.label}; your data rows are not.</span>
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
              setUserKey(key);
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

      {(output || busy) && (
        <div className="ml-6 mt-2">
          <pre className="max-h-48 overflow-auto rounded-lg border border-line bg-raised p-2.5 font-mono text-[12px] leading-[19px] text-ink">
            {sql || " "}
            {busy && <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-accent" />}
          </pre>
          {!busy && sql && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button onClick={() => replace(true)} className={btn.primary}>
                <Icon name="play" size={13} />
                Use and run
              </button>
              <button onClick={() => replace(false)} className={btn.secondary}>
                Replace query
              </button>
              <button
                onClick={() => {
                  insertAtCursor(sql);
                  setOutput("");
                  closeAi();
                }}
                className={btn.secondary}
              >
                Insert at cursor
              </button>
              <button onClick={() => setOutput("")} className={btn.ghost}>
                Discard
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
