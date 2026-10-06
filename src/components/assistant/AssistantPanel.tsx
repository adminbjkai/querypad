"use client";

import { useEffect, useRef, useState } from "react";
import { useAssistantStore, type AssistantMessage, type AssistantRun } from "@/stores/assistant-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore, toast } from "@/stores/ui-store";
import { useSnippetStore } from "@/stores/snippet-store";
import { parseAction } from "@/lib/ai/assistant-context";
import { applyAction, actionSql, describeAction } from "@/lib/assistant-actions";
import { insertSnippet, openSnippet } from "@/lib/workspace-actions";
import { copyText } from "@/lib/export/clipboard";
import ModelPicker from "@/components/ai/ModelPicker";
import Markdown from "./Markdown";
import { Icon } from "@/components/ui/icons";
import { MOD, Spinner, btn } from "@/components/ui/primitives";

const SUGGESTIONS = [
  "Summarize the tables in this space",
  "How do these tables relate?",
  "Explain the query in the editor",
  "Check the data for quality issues",
];

function SqlCard({ sql, streaming }: { sql: string; streaming: boolean }) {
  const ws = useWorkspaceStore.getState;
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-raised">
      <pre className="max-h-64 overflow-auto px-3 py-2 font-mono text-[12px] leading-[18px] text-ink">{sql}</pre>
      {!streaming && (
        <div className="flex flex-wrap items-center gap-0.5 border-t border-line bg-surface px-1.5 py-1">
          <button onClick={() => openSnippet(sql, "Assistant query", true)} className={`${btn.ghost} h-6 text-[12px] text-accent`}>
            <Icon name="play" size={12} /> Run in new tab
          </button>
          <button onClick={() => insertSnippet(sql)} className={`${btn.ghost} h-6 text-[12px]`}>
            Insert
          </button>
          <button
            onClick={() => {
              ws().setViewMode("sql");
              ws().updateTab(ws().activeTabId, { query: sql });
            }}
            className={`${btn.ghost} h-6 text-[12px]`}
          >
            Replace
          </button>
          <span className="flex-1" />
          <button
            onClick={() => useSnippetStore.getState().openEditor({ name: "", sql })}
            className={btn.icon}
            title="Save as snippet"
            aria-label="Save as snippet"
          >
            <Icon name="bookmark" size={13} />
          </button>
          <button onClick={() => void copyText(sql).then(() => toast("SQL copied."))} className={btn.icon} title="Copy SQL" aria-label="Copy SQL">
            <Icon name="copy" size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function RunCard({ run }: { run: AssistantRun | undefined; sql: string }) {
  const [open, setOpen] = useState(false);
  if (!run) {
    return (
      <p className="flex items-center gap-1.5 text-[12px] text-muted">
        <Spinner className="size-3 text-accent" /> Looking at the data…
      </p>
    );
  }
  const r = run.result;
  return (
    <div className="rounded-lg border border-line bg-surface">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[12px] text-muted hover:text-ink" aria-expanded={open}>
        <Icon name={open ? "chevronDown" : "chevronRight"} size={12} />
        <Icon name="table" size={12} />
        <span className="flex-1">
          {run.error ? <span className="text-danger">Lookup failed</span> : `Looked at the data · ${r?.rowCount.toLocaleString()} rows · ${r?.executionTimeMs} ms`}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-line p-2">
          <pre className="overflow-auto rounded bg-raised px-2 py-1.5 font-mono text-[11px] leading-4 text-ink">{run.sql}</pre>
          {run.error && <p className="text-[12px] text-danger">{run.error}</p>}
          {r && r.columns.length > 0 && (
            <div className="max-h-48 overflow-auto rounded border border-line">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-raised">
                  <tr>
                    {r.columns.map((c) => (
                      <th key={c} className="border-b border-line px-1.5 py-1 text-left font-medium text-muted">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.rows.slice(0, 20).map((row, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      {r.columns.map((c) => (
                        <td key={c} className="max-w-[160px] truncate px-1.5 py-0.5 font-mono">
                          {row[c] === null || row[c] === undefined ? <span className="text-faint">NULL</span> : String(row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionCard({ json, appliedKey, streaming }: { json: string; appliedKey: string; streaming: boolean }) {
  const applied = useAssistantStore((s) => !!s.applied[appliedKey]);
  const [busy, setBusy] = useState(false);
  if (streaming) return <p className="text-[12px] text-faint">Preparing an action…</p>;
  const action = parseAction(json);
  if (!action) return null;
  const sql = actionSql(action);
  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft/40 p-2">
      <div className="flex items-center gap-2">
        <Icon name="wand" size={14} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1 text-[12px] font-medium text-ink">{describeAction(action)}</span>
        <button
          disabled={applied || busy}
          onClick={async () => {
            setBusy(true);
            try {
              if (await applyAction(action)) useAssistantStore.getState().markApplied(appliedKey);
            } catch (err) {
              toast(`That didn't work: ${err instanceof Error ? err.message : err}`, "error");
            } finally {
              setBusy(false);
            }
          }}
          className={`${applied ? btn.ghost : btn.primary} h-7`}
        >
          {applied ? (
            <>
              <Icon name="check" size={12} /> Done
            </>
          ) : (
            "Apply"
          )}
        </button>
      </div>
      {sql && <pre className="mt-1.5 max-h-32 overflow-auto rounded bg-surface px-2 py-1 font-mono text-[11px] leading-4 text-ink">{sql}</pre>}
    </div>
  );
}

function Reply({ message, streaming }: { message: Pick<AssistantMessage, "id" | "content" | "run">; streaming: boolean }) {
  return (
    <Markdown
      text={message.content}
      renderCode={(lang, code, index) => {
        if (lang === "sql-run") return <RunCard run={message.run} sql={code} />;
        if (lang === "action") return <ActionCard json={code} appliedKey={`${message.id}:${index}`} streaming={streaming} />;
        if (lang === "sql" || lang === "") return <SqlCard sql={code} streaming={streaming} />;
        return <pre className="overflow-auto rounded-lg border border-line bg-raised px-3 py-2 font-mono text-[12px]">{code}</pre>;
      }}
    />
  );
}

/** The side Assistant: a chat that sees the whole workspace and can drive the app. */
export default function AssistantPanel() {
  const messages = useAssistantStore((s) => s.messages);
  const draft = useAssistantStore((s) => s.draft);
  const status = useAssistantStore((s) => s.status);
  const error = useAssistantStore((s) => s.error);
  const spaceId = useWorkspaceStore((s) => s.spaceId);
  const tableCount = useWorkspaceStore((s) => s.tables.length + s.views.length);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = status !== "idle";

  useEffect(() => {
    useAssistantStore.getState().loadFor(spaceId);
  }, [spaceId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, draft, status]);

  const send = (value = text) => {
    if (!value.trim() || busy) return;
    setText("");
    void useAssistantStore.getState().send(value);
  };

  const visible = messages.filter((m) => m.role !== "tool");

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-line bg-surface max-md:fixed max-md:inset-y-12 max-md:right-0 max-md:z-30 max-md:w-full" aria-label="Assistant">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <Icon name="sparkle" size={15} className="text-accent" />
        <h2 className="text-[13px] font-semibold text-ink">Assistant</h2>
        <span className="flex-1" />
        <ModelPicker compact />
        <button
          onClick={() => useAssistantStore.getState().reset()}
          disabled={visible.length === 0 && !busy}
          className={btn.icon}
          title="New conversation"
          aria-label="New conversation"
        >
          <Icon name="plus" size={15} />
        </button>
        <button onClick={() => useUiStore.getState().setAssistantOpen(false)} className={btn.icon} title={`Close (${MOD}+I)`} aria-label="Close assistant">
          <Icon name="x" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-live="polite">
        {visible.length === 0 && !busy && (
          <div className="px-1 pt-6">
            <p className="text-[14px] font-semibold text-ink">Ask about your data</p>
            <p className="mt-1 text-[13px] leading-5 text-muted">
              I can see your {tableCount} {tableCount === 1 ? "table" : "tables"}, joins, open tabs, results, history and snippets. I look things
              up with read-only queries; anything that changes your workspace waits for your click.
            </p>
            <div className="mt-4 flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-lg border border-line px-3 py-2 text-left text-[13px] text-ink hover:border-line-strong hover:bg-raised"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <ol className="space-y-4">
          {visible.map((m) =>
            m.role === "user" ? (
              <li key={m.id} className="flex justify-end" data-testid="assistant-user">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent-soft px-3 py-2 text-[13px] leading-5 text-ink">
                  {m.content}
                </p>
              </li>
            ) : (
              <li key={m.id} data-testid="assistant-reply">
                <Reply message={m} streaming={false} />
              </li>
            )
          )}
          {busy && (
            <li data-testid="assistant-streaming">
              {draft ? (
                <Reply message={{ id: "draft", content: draft }} streaming />
              ) : (
                <p className="flex items-center gap-1.5 text-[12px] text-muted">
                  <Spinner className="size-3 text-accent" />
                  {status === "running-query" ? "Looking at the data…" : "Thinking…"}
                </p>
              )}
            </li>
          )}
        </ol>
        {error && <p className="mt-3 rounded-md bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger">{error}</p>}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-line p-2.5">
        <div className="rounded-xl border border-line bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={Math.min(6, Math.max(2, text.split("\n").length))}
            placeholder="Ask anything about your data or this workspace…"
            className="block w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] leading-5 text-ink outline-none placeholder:text-faint"
            aria-label="Message the assistant"
          />
          <div className="flex items-center justify-between px-2 pb-1.5">
            <span className="text-[11px] text-faint">Enter to send · Shift+Enter for a new line</span>
            {busy ? (
              <button onClick={() => useAssistantStore.getState().stop()} className={`${btn.secondary} h-7`}>
                <Icon name="stop" size={12} /> Stop
              </button>
            ) : (
              <button onClick={() => send()} disabled={!text.trim()} className={`${btn.primary} h-7`} aria-label="Send message">
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
