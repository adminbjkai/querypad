"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useAgentStore, type AgentMessage, type SessionStatus } from "@/stores/agent-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import Markdown from "@/components/assistant/Markdown";
import { Icon } from "@/components/ui/icons";
import { btn } from "@/components/ui/primitives";
import Composer from "./Composer";
import PlanCard from "./PlanCard";
import SessionList from "./SessionList";
import SummaryCard from "./SummaryCard";

const SUGGESTIONS = [
  "Create a demo schema with customers, orders and order items",
  "Add a date dimension table",
  "Clean up: find and fix null-heavy columns",
  "Summarize what's in this space",
];

const timeLabel = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function TurnHeader({ model, at }: { model?: string; at?: number }) {
  return (
    <div className="mb-1 flex items-center gap-1.5 text-[11px] text-faint">
      <Icon name="agent" size={11} className="text-accent" />
      <span className="font-medium">{model ?? "Agent"}</span>
      {at !== undefined && <span className="tabular-nums opacity-0 transition-opacity group-hover/msg:opacity-100 group-focus-within/msg:opacity-100">{timeLabel(at)}</span>}
    </div>
  );
}

const codeBlock = (_: string, code: string) => <pre className="overflow-auto rounded-lg border border-line bg-raised px-3 py-2 font-mono text-[12px]">{code}</pre>;

/** While the plan streams in, its JSON block shows as a quiet placeholder instead of raw JSON. */
const draftBlock = (lang: string, code: string) =>
  lang === "json" || code.trimStart().startsWith("{") ? (
    <p className="flex items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2 text-[12px] text-muted">
      <span className="qp-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      Writing the plan…
    </p>
  ) : (
    codeBlock(lang, code)
  );

const Turn = memo(function Turn({
  message,
  status,
  latest,
  onFollowUp,
}: {
  message: AgentMessage;
  status: SessionStatus;
  latest: boolean;
  onFollowUp: (text: string) => void;
}) {
  if (message.role === "user") {
    return (
      <li className="flex justify-end" data-testid="agent-user">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2 text-[13px] leading-5 text-ink">{message.content}</p>
      </li>
    );
  }
  if (message.role === "plan") {
    return (
      <li className="group/msg" data-testid="agent-plan">
        <TurnHeader model={message.model} at={message.at} />
        <PlanCard turn={message} status={status} latest={latest} />
      </li>
    );
  }
  if (message.role === "summary") {
    return (
      <li className="group/msg" data-testid="agent-summary">
        <SummaryCard turn={message} onFollowUp={onFollowUp} />
      </li>
    );
  }
  return (
    <li className="group/msg" data-testid="agent-reply">
      <TurnHeader model={message.model} at={message.at} />
      <div className="text-[14px] leading-6 text-ink">
        <Markdown text={message.content} renderCode={codeBlock} />
      </div>
    </li>
  );
});

/**
 * The Agent page: a planning, write-capable AI that does multi-step work on the space's tables
 * with approvals. Separate from the answer-only Assistant panel.
 */
export default function AgentPage() {
  const spaceId = useWorkspaceStore((s) => s.spaceId);
  const tableCount = useWorkspaceStore((s) => s.tables.length + s.views.length);
  const sessions = useAgentStore((s) => s.sessions);
  const activeId = useAgentStore((s) => s.activeId);
  const draft = useAgentStore((s) => s.draft);
  const activity = useAgentStore((s) => s.activity);
  const error = useAgentStore((s) => s.error);
  const session = sessions.find((s) => s.id === activeId);
  const status: SessionStatus = session?.status ?? "idle";
  const busy = status === "planning" || status === "running";
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    useAgentStore.getState().loadFor(spaceId);
  }, [spaceId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeId]);

  // Follow the thread: new turns, streamed text and step updates land at the bottom.
  const messageCount = session?.messages.length ?? 0;
  const stepSignature = session?.messages.map((m) => (m.role === "plan" ? m.steps.map((s) => s.status).join("") : "")).join("|") ?? "";
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messageCount, draft, activity, stepSignature, activeId]);

  // ⌘/Ctrl+Enter runs the plan that is waiting for it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      const state = useAgentStore.getState();
      const current = state.sessions.find((s) => s.id === state.activeId);
      const plan = current?.messages.findLast((m) => m.role === "plan");
      if (!current || !plan || plan.role !== "plan" || plan.planOnly) return;
      if (current.status === "planning" || current.status === "running" || current.status === "awaiting") return;
      if (!plan.steps.some((s) => s.status === "pending")) return;
      e.preventDefault();
      state.runPlan();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const send = (value?: string) => {
    const message = (value ?? text).trim();
    if (!message) return;
    setText("");
    void useAgentStore.getState().send(message);
  };

  const followUp = (suggestion: string) => {
    setText(suggestion);
    inputRef.current?.focus();
  };

  const messages = session?.messages ?? [];
  const lastPlanId = session?.messages.findLast((m) => m.role === "plan")?.id;

  return (
    <div className="flex h-full min-h-0 flex-1 bg-surface" aria-label="Agent">
      <SessionList sessions={sessions} activeId={activeId} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 sm:px-8" aria-live="polite">
          <div className="mx-auto w-full max-w-[880px] pb-6 pt-5">
            <h1 className="flex items-center gap-2 text-[22px] font-semibold leading-7 tracking-[-0.01em] text-ink">
              <Icon name="agent" size={20} className="text-accent" />
              Agent
            </h1>
            {messages.length === 0 && !busy ? (
              <div className="pt-16 text-center">
                <span className="mx-auto flex size-9 items-center justify-center rounded-lg bg-raised text-muted">
                  <Icon name="agent" size={18} />
                </span>
                <p className="mt-3 text-[18px] font-semibold tracking-[-0.01em] text-ink">Hi — what should we build?</p>
                <p className="mt-1 text-[13px] text-muted">
                  I plan the SQL, you approve each change. I can see your {tableCount} {tableCount === 1 ? "table" : "tables"}, their columns and joins.
                </p>
                <div className="mx-auto mt-5 grid max-w-[640px] gap-2 sm:grid-cols-2" aria-label="Suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-left text-[13px] text-ink transition-colors hover:border-line-strong hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {s}
                      <Icon name="chevronRight" size={14} className="shrink-0 text-faint" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ol className="mt-5 space-y-5">
                {messages.map((m) => (
                  <Turn key={m.id} message={m} status={status} latest={m.id === lastPlanId} onFollowUp={followUp} />
                ))}
                {status === "planning" && (
                  <li className="group/msg" data-testid="agent-streaming">
                    <TurnHeader />
                    {draft ? (
                      <div className="text-[14px] leading-6 text-ink">
                        <Markdown text={draft} renderCode={draftBlock} />
                      </div>
                    ) : null}
                  </li>
                )}
              </ol>
            )}
            {activity && (
              <p className="mt-4 flex items-center gap-2 text-[12px] text-muted" role="status">
                <span className="qp-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                {activity}
                <button onClick={() => useAgentStore.getState().cancel()} className={`${btn.ghost} !h-6 !px-1.5 text-[11px]`}>
                  Cancel
                </button>
              </p>
            )}
            {error && <p className="mt-3 rounded-md bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger">{error}</p>}
          </div>
        </div>
        <Composer text={text} setText={setText} onSend={() => send()} busy={busy} inputRef={inputRef} />
      </div>
    </div>
  );
}
