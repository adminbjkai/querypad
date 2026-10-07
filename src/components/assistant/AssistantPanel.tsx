"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useAssistantStore, type AssistantMessage, type AssistantRun } from "@/stores/assistant-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useShallow } from "zustand/react/shallow";
import { useUiStore, toast } from "@/stores/ui-store";
import { copyText } from "@/lib/export/clipboard";
import ModelPicker from "@/components/ai/ModelPicker";
import Markdown from "./Markdown";
import ChatList from "./ChatList";
import { Icon } from "@/components/ui/icons";
import { MOD, btn } from "@/components/ui/primitives";

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

/** Calm animated "working" indicator; motion stops under prefers-reduced-motion. */
function Working({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-[12px] text-muted">
      <span className="qp-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {label}
    </p>
  );
}

function RunCard({ run }: { run: AssistantRun | undefined; sql: string }) {
  const [open, setOpen] = useState(false);
  if (!run) return <Working label="Looking at the data…" />;
  const r = run.result;
  return (
    <div className="my-1 rounded-lg border border-line bg-raised/50">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[12px] text-muted hover:text-ink" aria-expanded={open}>
        <Icon name={open ? "chevronDown" : "chevronRight"} size={12} />
        <Icon name="table" size={12} />
        <span className="flex-1 tabular-nums">
          {run.error ? <span className="text-danger">Lookup failed</span> : `Looked at the data · ${r?.rowCount.toLocaleString()} rows · ${r?.executionTimeMs} ms`}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-line p-2">
          <pre className="overflow-auto rounded bg-raised px-2 py-1.5 font-mono text-[11px] leading-4 text-ink">{run.sql}</pre>
          {run.error && <p className="text-[12px] text-danger">{run.error}</p>}
          {r && r.columns.length > 0 && (
            <div className="max-h-48 overflow-auto rounded border border-line bg-surface">
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

const timeLabel = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function Reply({ message, streaming }: { message: Pick<AssistantMessage, "id" | "content" | "run">; streaming: boolean }) {
  return (
    <div className="text-[14px] leading-6 text-ink">
      <Markdown
        text={message.content}
        renderCode={(lang, code) => {
          if (lang === "sql-run") return <RunCard run={message.run} sql={code} />;
          if (lang === "sql" || lang === "") return <SqlCard sql={code} streaming={streaming} />;
          return <pre className="overflow-auto rounded-lg border border-line bg-raised px-3 py-2 font-mono text-[12px]">{code}</pre>;
        }}
      />
    </div>
  );
}

/** Small line above an answer: who wrote it, with the time revealed on hover or focus. */
function ReplyHeader({ model, at }: { model?: string; at?: number }) {
  return (
    <div className="mb-1 flex items-center gap-1.5 text-[11px] text-faint">
      <Icon name="sparkle" size={11} className="text-accent" />
      <span className="font-medium">{model ?? "Assistant"}</span>
      {at !== undefined && <span className="tabular-nums opacity-0 transition-opacity group-hover/msg:opacity-100 group-focus-within/msg:opacity-100">{timeLabel(at)}</span>}
    </div>
  );
}

const MessageItem = memo(function MessageItem({ message, header }: { message: AssistantMessage; header: boolean }) {
  if (message.role === "user") {
    return (
      <li className="flex justify-end" data-testid="assistant-user">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent-soft px-3 py-2 text-[13px] leading-5 text-ink">{message.content}</p>
      </li>
    );
  }
  return (
    <li className="group/msg" data-testid="assistant-reply">
      {header && <ReplyHeader model={message.model} at={message.at} />}
      <Reply message={message} streaming={false} />
    </li>
  );
});

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

const STARTERS = SUGGESTIONS;

const ADD_CONTEXT = [
  "About the query in the editor: ",
  "About the current result: ",
  "About the open tabs: ",
];

/** The side Assistant: a chat that sees the whole workspace and answers questions about it. */
export default function AssistantPanel() {
  const messages = useAssistantStore((s) => s.messages);
  const conversations = useAssistantStore((s) => s.conversations);
  const activeId = useAssistantStore((s) => s.activeId);
  const draft = useAssistantStore((s) => s.draft);
  const status = useAssistantStore((s) => s.status);
  const error = useAssistantStore((s) => s.error);
  const spaceId = useWorkspaceStore((s) => s.spaceId);
  const tableCount = useWorkspaceStore((s) => s.tables.length + s.views.length);
  const width = useUiStore((s) => s.assistantWidth);
  // Booleans only: the tab object itself is new on every keystroke/result, so selecting it
  // would re-render the whole panel each time.
  const activeTab = useWorkspaceStore(
    useShallow((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      return { hasQuery: !!tab?.query.trim(), hasError: !!tab?.error, hasResult: !!tab?.result };
    })
  );
  const [text, setText] = useState("");
  const [hasNewContent, setHasNewContent] = useState(false);
  const [showChats, setShowChats] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const busy = status !== "idle";

  useEffect(() => {
    useAssistantStore.getState().loadFor(spaceId);
  }, [spaceId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!plusOpen) return;
    const onDown = (e: MouseEvent) => !plusRef.current?.contains(e.target as Node) && setPlusOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPlusOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [plusOpen]);

  // Follow the conversation while the reader is at the bottom; if they scrolled up, leave them
  // there and offer a jump to the latest reply once something new arrives (streamed or whole).
  // Opening another chat always starts at its end.
  const seenRef = useRef({ count: messages.length, draft, activeId });
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const switched = seenRef.current.activeId !== activeId;
    const grew = messages.length > seenRef.current.count || (draft !== "" && draft !== seenRef.current.draft);
    seenRef.current = { count: messages.length, draft, activeId };
    if (switched) {
      followLatestRef.current = true;
      container.scrollTop = container.scrollHeight;
      const frame = window.requestAnimationFrame(() => setHasNewContent(false));
      return () => window.cancelAnimationFrame(frame);
    }
    if (followLatestRef.current) {
      container.scrollTop = container.scrollHeight;
    } else if (grew) {
      const frame = window.requestAnimationFrame(() => {
        if (!followLatestRef.current) setHasNewContent(true);
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [messages.length, draft, status, activeId]);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 48;
    followLatestRef.current = nearBottom;
    if (nearBottom) setHasNewContent(false);
  };

  const send = (value = text) => {
    if (!value.trim() || busy) return;
    followLatestRef.current = true;
    setHasNewContent(false);
    setText("");
    void useAssistantStore.getState().send(value);
  };

  const visible = useMemo(() => messages.filter((m) => m.role !== "tool"), [messages]);
  const lastIsAssistant = visible[visible.length - 1]?.role === "assistant";

  return (
    <aside
      style={{ width }}
      className="relative flex h-full min-w-0 flex-col border-l border-line bg-surface max-md:fixed max-md:top-20 max-md:bottom-6 max-md:right-0 max-md:z-30 max-md:h-auto max-md:!w-full"
      aria-label="Assistant"
    >
      <ResizeHandle />
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-chrome px-3">
        <Icon name="sparkle" size={15} className="mr-1 text-accent" />
        <h2 className="text-[13px] font-semibold text-ink">Assistant</h2>
        <span className="flex-1" />
        <button
          onClick={() => setShowChats((v) => !v)}
          className={`${btn.icon} ${showChats ? "bg-sunken text-ink" : ""}`}
          title="All chats"
          aria-label="All chats"
          aria-pressed={showChats}
        >
          <Icon name="chat" size={15} />
        </button>
        <button
          onClick={() => {
            useAssistantStore.getState().newChat();
            setShowChats(false);
            inputRef.current?.focus();
          }}
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

      <div className="relative flex min-h-0 flex-1 flex-col">
        {showChats && <ChatList conversations={conversations} activeId={activeId} onClose={() => setShowChats(false)} />}
        <div className="relative min-h-0 flex-1" inert={showChats}>
          <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto px-3 py-3" aria-live="polite">
            {visible.length === 0 && !busy && (
              <div className="px-1 pt-8">
                <p className="text-[15px] font-semibold text-ink">Ask about your data</p>
                <p className="mt-1 text-[13px] leading-5 text-muted">
                  I can see your {tableCount} {tableCount === 1 ? "table" : "tables"}, joins, open tabs, results, history and snippets, and I run read-only queries when I need
                  actual values.
                </p>
                <div className="mt-4 flex flex-col gap-1.5">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-left text-[13px] text-ink transition-colors hover:border-line-strong hover:bg-raised"
                    >
                      {s}
                      <Icon name="chevronRight" size={13} className="text-faint" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <ol className="space-y-4">
              {visible.map((m, i) => (
                <MessageItem key={m.id} message={m} header={visible[i - 1]?.role !== "assistant"} />
              ))}
              {busy && (
                <li className="group/msg" data-testid="assistant-streaming">
                  {!lastIsAssistant && <ReplyHeader model={undefined} />}
                  {draft ? <Reply message={{ id: "draft", content: draft }} streaming /> : <Working label={status === "running-query" ? "Looking at the data…" : "Thinking…"} />}
                </li>
              )}
            </ol>
            {error && <p className="mt-3 rounded-md bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger">{error}</p>}
          </div>
          {hasNewContent && (
            <button
              onClick={() => {
                followLatestRef.current = true;
                if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                setHasNewContent(false);
              }}
              className={`${btn.secondary} absolute bottom-3 left-1/2 z-10 -translate-x-1/2 shadow-pop`}
              aria-label="Scroll to latest response"
            >
              <Icon name="chevronDown" size={13} />
              New response
            </button>
          )}
        </div>

        <div className="shrink-0 px-3 pb-2 pt-1" inert={showChats}>
          {!busy && visible.length > 0 && (
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Quick questions">
              {[
                activeTab.hasQuery && "Explain the query in the editor",
                activeTab.hasError && "Why did my query fail?",
                activeTab.hasResult && "Summarize this result",
                activeTab.hasResult && "What chart fits this result?",
                "Any data quality issues?",
              ]
                .filter((q): q is string => !!q)
                .map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="shrink-0 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] text-muted transition-colors hover:border-line-strong hover:text-ink"
                  >
                    {q}
                  </button>
                ))}
            </div>
          )}
          <div className="rounded-2xl border border-line bg-surface shadow-sm transition-shadow focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={Math.min(6, Math.max(2, text.split("\n").length))}
              placeholder="Ask anything about your data…"
              title="Enter to send · Shift+Enter for a new line"
              className="block w-full resize-none bg-transparent px-3.5 pt-3 text-[13px] leading-5 text-ink outline-none placeholder:text-faint"
              aria-label="Message the assistant"
            />
            <div className="flex items-center gap-2 px-2 pb-2 pt-1">
              <div className="qp-menu-up relative" ref={plusRef}>
                <button
                  onClick={() => setPlusOpen((o) => !o)}
                  className="inline-flex size-8 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-line-strong hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  aria-label="Add context"
                  aria-expanded={plusOpen}
                  aria-haspopup="menu"
                  title="Add context"
                >
                  <Icon name="plus" size={15} />
                </button>
                {plusOpen && (
                  <div role="menu" aria-label="Add context" className="qp-pop absolute left-0 z-50 w-56 rounded-xl border border-line bg-surface p-1 shadow-pop">
                    {ADD_CONTEXT.map((c) => (
                      <button
                        key={c}
                        role="menuitem"
                        onClick={() => {
                          setText((t) => (t ? t : c));
                          setPlusOpen(false);
                          inputRef.current?.focus();
                        }}
                        className="flex w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink hover:bg-raised"
                      >
                        {c.replace(/: $/, "")}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="flex-1" />
              <div className="qp-menu-up min-w-0">
                <ModelPicker compact />
              </div>
              {busy ? (
                <button
                  onClick={() => useAssistantStore.getState().stop()}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12px] font-medium text-ink hover:border-line-strong hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Icon name="stop" size={11} /> Stop
                </button>
              ) : (
                <button
                  onClick={() => send()}
                  disabled={!text.trim()}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  aria-label="Send message"
                  title="Send (Enter)"
                >
                  <Icon name="arrowUp" size={15} />
                </button>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-faint">AI can make mistakes — check important results.</p>
        </div>
      </div>
    </aside>
  );
}
