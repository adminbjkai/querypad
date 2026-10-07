"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useAgentStore } from "@/stores/agent-store";
import { selectEngineReady, useWorkspaceStore } from "@/stores/workspace-store";
import { quoteIdent } from "@/lib/duckdb/sql-utils";
import ModelPicker from "@/components/ai/ModelPicker";
import { Icon } from "@/components/ui/icons";
import { Menu, Segmented, type MenuEntry } from "@/components/ui/primitives";
import { LockGlyph, ShieldGlyph } from "./glyphs";

const MAX_TABLE_ITEMS = 30;

/** The Agent composer: the request box with its approval, plan-mode and model controls. */
export default function Composer({
  text,
  setText,
  onSend,
  busy,
  inputRef,
}: {
  text: string;
  setText: (text: string | ((t: string) => string)) => void;
  onSend: () => void;
  /** Planning or running: the send button becomes Cancel. */
  busy: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const approvals = useAgentStore((s) => s.approvals);
  const planOnly = useAgentStore((s) => s.planOnly);
  const tables = useWorkspaceStore((s) => s.tables);
  const views = useWorkspaceStore((s) => s.views);
  const ready = useWorkspaceStore(selectEngineReady);
  const focusAfter = useRef(false);

  useEffect(() => {
    if (focusAfter.current) {
      focusAfter.current = false;
      inputRef.current?.focus();
    }
  });

  const mention = (name: string) => {
    setText((t) => `${t}${t && !/\s$/.test(t) ? " " : ""}@${quoteIdent(name)} `);
    focusAfter.current = true;
  };
  const names = [...tables.map((t) => t.name), ...views.map((v) => v.name)];
  const contextItems: MenuEntry[] = [
    { heading: "Attach table" },
    ...names.slice(0, MAX_TABLE_ITEMS).map((name) => ({ label: name, icon: "table" as const, onSelect: () => mention(name) })),
    ...(names.length === 0 ? [{ label: "No tables loaded", disabled: true, onSelect: () => {} }] : []),
  ];

  return (
    <div className="shrink-0 px-5 pb-3 pt-1 sm:px-8">
      <div className="mx-auto w-full max-w-[880px]">
        <div className="rounded-2xl border border-line bg-surface shadow-sm transition-shadow focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (ready) onSend();
              }
            }}
            rows={Math.min(8, Math.max(2, text.split("\n").length))}
            placeholder="Ask the agent to build or change something…"
            title="Enter to send · Shift+Enter for a new line"
            className="block w-full resize-none bg-transparent px-3.5 pt-3 text-[13px] leading-5 text-ink outline-none placeholder:text-faint"
            aria-label="Ask the agent"
          />
          <div className="flex flex-wrap items-center gap-2 px-2 pb-2 pt-1">
            <Menu
              label="Add context"
              align="left"
              side="top"
              items={contextItems}
              trigger={({ open, toggle }) => (
                <button
                  onClick={toggle}
                  className="inline-flex size-8 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-line-strong hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  aria-label="Add context"
                  aria-expanded={open}
                  aria-haspopup="menu"
                  title="Attach a table as @context"
                >
                  <Icon name="plus" size={16} />
                </button>
              )}
            />
            <span className="inline-flex items-center gap-1.5" title="Default approvals">
              <ShieldGlyph size={14} className="text-muted" />
              <Segmented
                ariaLabel="Approvals"
                size="sm"
                value={approvals}
                onChange={(v) => useAgentStore.getState().setApprovals(v)}
                options={[
                  { value: "ask", label: "Ask", title: "Ask before changes (the agent asks you to approve each write)" },
                  { value: "auto", label: "Auto", title: "Auto-apply (writes run without asking; destructive steps still ask)" },
                ]}
              />
            </span>
            <button
              onClick={() => useAgentStore.getState().setPlanOnly(!planOnly)}
              aria-pressed={planOnly}
              aria-label="Plan mode"
              title={planOnly ? "Plan mode: the agent only plans, nothing runs" : "Plan mode off: plans can be run"}
              className={`inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                planOnly ? "bg-warn-soft text-warn" : "bg-raised text-muted hover:text-ink"
              }`}
            >
              <LockGlyph size={11} /> Plan
            </button>
            <span className="flex-1" />
            <div className="qp-menu-up min-w-0">
              <ModelPicker compact />
            </div>
            {busy ? (
              <button
                onClick={() => useAgentStore.getState().cancel()}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12px] font-medium text-ink hover:border-line-strong hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label="Cancel"
              >
                <Icon name="stop" size={11} /> Cancel
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={!text.trim() || !ready}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                aria-label="Send to agent"
                title={ready ? "Send (Enter)" : "Engine starting…"}
              >
                <Icon name="arrowUp" size={16} />
              </button>
            )}
          </div>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-faint">AI can make mistakes — review each step before it runs.</p>
      </div>
    </div>
  );
}
