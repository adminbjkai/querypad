"use client";

import { useEffect, useRef, useState } from "react";
import { useAssistantStore, type AssistantMessage, type AssistantRun } from "@/stores/assistant-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore, toast } from "@/stores/ui-store";
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

/** SQL in an answer: shown with a copy button — the assistant only replies, it never edits. */
function SqlCard({ sql, streaming }: { sql: string; streaming: boolean }) {
  return (
    <div className="group/sql relative overflow-hidden rounded-lg border border-line bg-raised">
      <div className="flex items-center justify-between border-b border-line px-3 py-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-faint">SQL</span>
        {!streaming && (
          <button
            onClick={() => void copyText(sql).then(() => toast("SQL copied."))}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted hover:bg-sunken hover:text-ink"
            aria-label="Copy SQL"
          >
            <Icon name="copy" size={12} /> Copy
          </button>
        )}
      </div>
      <pre className="max-h-72 overflow-auto px-3 py-2 font-mono text-[12px] leading-[18px] text-ink">{sql}</pre>
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

function Reply({ message, streaming }: { message: Pick<AssistantMessage, "id" | "content" | "run">; streaming: boolean }) {
  return (
    <Markdown
      text={message.content}
      renderCode={(lang, code) => {
        if (lang === "sql-run") return <RunCard run={message.run} sql={code} />;
        if (lang === "sql" || lang === "") return <SqlCard sql={code} streaming={streaming} />;
        return <pre className="overflow-auto rounded-lg border border-line bg-raised px-3 py-2 font-mono text-[12px]">{code}</pre>;
      }}
    />
  );
}

const MIN_WIDTH = 300;
const MAX_WIDTH = 760;

/** The collapsed assistant: a slim rail on the right edge that opens the panel. */
export function AssistantRail() {
  const busy = useAssistantStore((s) => s.status !== "idle");
  return (
    <div className="flex w-10 shrink-0 flex-col items-center border-l border-line bg-surface py-2 max-md:hidden">
      <button
        onClick={() => useUiStore.getState().setAssistantOpen(true)}
        className="flex flex-col items-center gap-2 rounded-md px-1.5 py-2 text-muted hover:bg-sunken hover:text-ink"
        title={`Open the Assistant (${MOD}+I)`}
        aria-label="Open assistant"
      >
        <Icon name="sparkle" size={16} className={busy ? "animate-pulse text-accent" : "text-accent"} />
        <span className="text-[12px] font-medium [writing-mode:vertical-rl]">Assistant</span>
      </button>
    </div>
  );
}

/** Drag the panel's left edge to resize; double-click resets. */
function ResizeHandle() {
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = useUiStore.getState().assistantWidth;
    const move = (ev: PointerEvent) => {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (startX - ev.clientX)));
      useUiStore.getState().setAssistantWidth(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize assistant"
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onDoubleClick={() => useUiStore.getState().setAssistantWidth(400)}
      onKeyDown={(e) => {
        const w = useUiStore.getState().assistantWidth;
        if (e.key === "ArrowLeft") useUiStore.getState().setAssistantWidth(Math.min(MAX_WIDTH, w + 24));
        if (e.key === "ArrowRight") useUiStore.getState().setAssistantWidth(Math.max(MIN_WIDTH, w - 24));
      }}
      tabIndex={0}
      className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize outline-none after:absolute after:inset-y-0 after:left-[3px] after:w-0.5 after:bg-transparent after:transition-colors hover:after:bg-accent focus-visible:after:bg-accent max-md:hidden"
    />
  );
}

/** The side Assistant: a chat that sees the whole workspace and answers questions about it. */
export default function AssistantPanel() {
  const messages = useAssistantStore((s) => s.messages);
  const draft = useAssistantStore((s) => s.draft);
  const status = useAssistantStore((s) => s.status);
  const error = useAssistantStore((s) => s.error);
  const spaceId = useWorkspaceStore((s) => s.spaceId);
  const tableCount = useWorkspaceStore((s) => s.tables.length + s.views.length);
  const width = useUiStore((s) => s.assistantWidth);
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
    <aside
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col border-l border-line bg-surface max-md:fixed max-md:inset-y-12 max-md:right-0 max-md:z-30 max-md:!w-full"
      aria-label="Assistant"
    >
      <ResizeHandle />
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
        <button onClick={() => useUiStore.getState().setAssistantOpen(false)} className={btn.icon} title={`Collapse (${MOD}+I)`} aria-label="Collapse assistant">
          <Icon name="panelRight" size={15} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-live="polite">
        {visible.length === 0 && !busy && (
          <div className="px-1 pt-6">
            <p className="text-[14px] font-semibold text-ink">Ask about your data</p>
            <p className="mt-1 text-[13px] leading-5 text-muted">
              I can see your {tableCount} {tableCount === 1 ? "table" : "tables"}, joins, open tabs, results, history and snippets. Ask me anything —
              I&apos;ll look things up with read-only queries when I need actual values, and answer here.
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
