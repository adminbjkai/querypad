"use client";

import { useCallback, useState } from "react";
import { useAgentStore, type AgentSession } from "@/stores/agent-store";
import { Icon } from "@/components/ui/icons";
import { Dialog, HoverTray, SectionLabel, btn, input } from "@/components/ui/primitives";
import { relativeTime } from "@/components/home/format";

/** The Agent page's left column: this space's sessions, newest first, with search and delete. */
export default function SessionList({ sessions, activeId }: { sessions: AgentSession[]; activeId: string | null }) {
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<AgentSession | null>(null);
  const [now] = useState(() => Date.now());
  const q = query.trim().toLowerCase();
  const shown = q ? sessions.filter((s) => s.title.toLowerCase().includes(q)) : sessions;
  const closeDelete = useCallback(() => setDeleting(null), []);

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-line bg-chrome max-md:hidden" aria-label="Chats">
      <div className="flex flex-col gap-2 p-3">
        <button onClick={() => useAgentStore.getState().newSession()} className={`${btn.secondary} w-full`}>
          <Icon name="plus" size={14} /> New chat
        </button>
        <label className="relative block">
          <Icon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats by title"
            aria-label="Search chats by title"
            className={`${input} !pl-8`}
          />
        </label>
      </div>
      <SectionLabel count={sessions.length} className="px-4 pb-1">
        All chats
      </SectionLabel>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-label="All chats">
        {shown.map((s) => (
          <li key={s.id} className="group relative">
            <button
              onClick={() => useAgentStore.getState().switchSession(s.id)}
              aria-current={s.id === activeId ? "true" : undefined}
              className={`flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] transition-colors ${
                s.id === activeId ? "bg-accent-soft text-ink" : "text-ink hover:bg-sunken"
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{s.title}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-faint group-hover:invisible group-focus-within:invisible">
                {relativeTime(s.updatedAt, { now, compact: true })}
              </span>
            </button>
            <HoverTray>
              <button onClick={() => setDeleting(s)} className={btn.iconSm} aria-label={`Delete chat: ${s.title}`} title="Delete chat">
                <Icon name="trash" size={14} />
              </button>
            </HoverTray>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="px-3 py-6 text-center text-[13px] text-muted">{sessions.length === 0 ? "No chats yet. Ask the agent to build something." : "No chats match."}</li>
        )}
      </ul>
      {deleting && (
        <Dialog
          title="Delete this chat?"
          onClose={closeDelete}
          footer={
            <>
              <button onClick={closeDelete} className={btn.secondary}>
                Cancel
              </button>
              <button
                onClick={() => {
                  useAgentStore.getState().deleteSession(deleting.id);
                  closeDelete();
                }}
                className={btn.danger}
              >
                Delete
              </button>
            </>
          }
        >
          <p className="text-[14px] leading-5 text-ink">
            “{deleting.title}” and its plan history will be removed. Tables it created stay in the space.
          </p>
        </Dialog>
      )}
    </aside>
  );
}
