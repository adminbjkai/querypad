"use client";

import { useState } from "react";
import { useAssistantStore, type Conversation } from "@/stores/assistant-store";
import { Icon } from "@/components/ui/icons";
import { btn, input } from "@/components/ui/primitives";

/** "Now", "5m", "3h", "5d", "2mo" — compact age of a chat. */
export function relativeTime(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "Now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}

const SEARCH_ABOVE = 6;

/** "All chats": this space's conversations, newest first; opens over the conversation. */
export default function ChatList({ conversations, activeId, onClose }: { conversations: Conversation[]; activeId: string | null; onClose: () => void }) {
  const [query, setQuery] = useState("");
  // Deleting takes a second click on the same chat (there is no undo).
  const [confirming, setConfirming] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const shown = q ? conversations.filter((c) => c.title.toLowerCase().includes(q)) : conversations;
  const [now] = useState(() => Date.now());

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-surface">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <h3 className="flex-1 text-[13px] font-semibold text-ink">All chats</h3>
        <button
          onClick={() => {
            useAssistantStore.getState().newChat();
            onClose();
          }}
          className={`${btn.secondary} !h-7`}
        >
          <Icon name="plus" size={13} /> New chat
        </button>
        <button onClick={onClose} className={btn.icon} aria-label="Close chat list" title="Back to the conversation">
          <Icon name="x" size={14} />
        </button>
      </div>
      {conversations.length > SEARCH_ABOVE && (
        <div className="shrink-0 border-b border-line p-2">
          <label className="relative block">
            <Icon name="search" size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats" aria-label="Search chats" className={`${input} !pl-8`} />
          </label>
        </div>
      )}
      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {shown.map((c) => (
          <li key={c.id} className="group/chat relative">
            <button
              onClick={() => {
                useAssistantStore.getState().switchChat(c.id);
                onClose();
              }}
              aria-current={c.id === activeId ? "true" : undefined}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] ${
                c.id === activeId ? "bg-accent-soft text-ink" : "text-ink hover:bg-sunken"
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-faint group-hover/chat:invisible group-focus-within/chat:invisible [@media(hover:none)]:invisible">{relativeTime(c.updatedAt, now)}</span>
            </button>
            <button
              onClick={() => {
                if (confirming !== c.id) return setConfirming(c.id);
                setConfirming(null);
                useAssistantStore.getState().deleteChat(c.id);
              }}
              onBlur={() => setConfirming((id) => (id === c.id ? null : id))}
              aria-label={confirming === c.id ? `Confirm delete chat: ${c.title}` : `Delete chat: ${c.title}`}
              title={confirming === c.id ? "Click again to delete this chat" : "Delete chat"}
              className={`${btn.icon} absolute right-1.5 top-1/2 !size-6 -translate-y-1/2 group-hover/chat:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 ${
                confirming === c.id ? "bg-danger-soft !text-danger opacity-100" : "opacity-0"
              }`}
            >
              <Icon name="trash" size={13} />
            </button>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="px-3 py-6 text-center text-[13px] text-muted">{conversations.length === 0 ? "No chats yet. Ask something to start one." : "No chats match."}</li>
        )}
      </ul>
    </div>
  );
}
