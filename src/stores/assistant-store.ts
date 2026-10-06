import { create } from "zustand";
import type { ChatTurn } from "@/lib/ai/complete";
import {
  ASSISTANT_SYSTEM_PROMPT,
  assistantTurnInput,
  buildAssistantContext,
  autoRunRejection,
  extractRunRequest,
  runResultMessage,
} from "@/lib/ai/assistant-context";
import { relationshipKey } from "@/lib/discovery/relationships";
import { getApiKey } from "@/lib/ai/api-key";
import { getAiProviderConfig } from "@/lib/ai/providers";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useSnippetStore } from "@/stores/snippet-store";
import { useAiStore, currentEffort } from "@/stores/ai-store";
import type { QueryResult } from "@/types";

/** A query the assistant ran on its own to look at the data (read-only, automatic). */
export interface AssistantRun {
  sql: string;
  result: QueryResult | null;
  error: string | null;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  at: number;
  run?: AssistantRun;
  /** Model that wrote an assistant reply, e.g. "Sonnet 5.5". */
  model?: string;
}

/** One saved chat in a space. */
export interface Conversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: AssistantMessage[];
}

interface AssistantState {
  /** This space's chats, most recently active first. */
  conversations: Conversation[];
  /** The open chat; null is a fresh chat that is saved with its first message. */
  activeId: string | null;
  /** Messages of the open chat (tool messages are not shown). */
  messages: AssistantMessage[];
  /** Text streaming in for the reply being written. */
  draft: string;
  status: "idle" | "thinking" | "running-query";
  error: string | null;
  spaceId: string | null;
  loadFor: (spaceId: string | null) => void;
  /** Sends in the open chat, starting one if none is open. */
  send: (text: string) => Promise<void>;
  stop: () => void;
  newChat: () => void;
  switchChat: (id: string) => void;
  deleteChat: (id: string) => void;
  /** Same as newChat (kept for existing callers). */
  reset: () => void;
}

const MAX_ROUNDS = 3;
const MAX_STORED = 80;
const MAX_CHATS = 30;
const MAX_HISTORY = 16;
const RESULT_ROWS_KEPT = 50;
const legacyKey = (spaceId: string) => `querypad:assistant:${spaceId}`;
const storageKey = (spaceId: string) => `querypad:assistant:v2:${spaceId}`;

const newId = () => crypto.randomUUID().slice(0, 12);

let controller: AbortController | null = null;

/** Without the rows of looked-up results (the reply text keeps what they showed). */
const withoutRows = (c: Conversation): Conversation => ({
  ...c,
  messages: c.messages.map((m) => (m.run?.result ? { ...m, run: { ...m.run, result: { ...m.run.result, rows: [] } } } : m)),
});

/**
 * Save a space's chats. When storage is full, first drop looked-up rows from the other chats,
 * then the oldest chats, so new messages keep being saved. Returns whether a save succeeded.
 */
function persist(spaceId: string | null, activeId: string | null, conversations: Conversation[]): boolean {
  if (!spaceId || typeof window === "undefined") return false;
  const write = (list: Conversation[]) => {
    try {
      localStorage.setItem(storageKey(spaceId), JSON.stringify({ activeId, conversations: list }));
      return true;
    } catch {
      return false;
    }
  };
  if (write(conversations)) return true;
  let list = conversations.map((c) => (c.id === activeId ? c : withoutRows(c)));
  while (list.length > 0) {
    if (write(list)) return true;
    const oldest = list.findLastIndex((c) => c.id !== activeId);
    if (oldest < 0) break;
    list = list.filter((_, i) => i !== oldest);
  }
  return write(list.map(withoutRows));
}

const titleOf = (text: string) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 59).trimEnd()}…` : t || "New chat";
};

/** Saved chats for a space; a pre-chats single conversation becomes one chat. */
function load(spaceId: string): { activeId: string | null; conversations: Conversation[] } {
  try {
    const raw = localStorage.getItem(storageKey(spaceId));
    if (raw) {
      const data = JSON.parse(raw) as { activeId?: string | null; conversations?: Conversation[] };
      const conversations = (Array.isArray(data.conversations) ? data.conversations : []).filter((c) => c && Array.isArray(c.messages));
      const activeId = conversations.some((c) => c.id === data.activeId) ? (data.activeId ?? null) : null;
      return { activeId, conversations };
    }
    const old = JSON.parse(localStorage.getItem(legacyKey(spaceId)) ?? "[]") as AssistantMessage[];
    if (Array.isArray(old) && old.length > 0) {
      const first = old.find((m) => m.role === "user");
      const conv: Conversation = {
        id: newId(),
        title: titleOf(first?.content ?? ""),
        updatedAt: old[old.length - 1]?.at ?? Date.now(),
        messages: old.slice(-MAX_STORED),
      };
      // Drop the old record first: both copies at once might not fit.
      localStorage.removeItem(legacyKey(spaceId));
      if (!persist(spaceId, conv.id, [conv])) localStorage.setItem(legacyKey(spaceId), JSON.stringify(old));
      return { activeId: conv.id, conversations: [conv] };
    }
  } catch {
    // unreadable storage: start empty
  }
  return { activeId: null, conversations: [] };
}

/** Everything the assistant should know right now, read fresh from the stores. */
function liveContext(): string {
  const ws = useWorkspaceStore.getState();
  const active = ws.tabs.find((t) => t.id === ws.activeTabId);
  return buildAssistantContext({
    tables: ws.tables,
    views: ws.views,
    profiles: Object.fromEntries(Object.entries(ws.tableProfiles).map(([name, p]) => [name, p.profile])),
    relationships: ws.discovery.relationships,
    verdicts: ws.relationshipVerdicts,
    relationshipKey,
    log: ws.history,
    editorQuery: active?.query ?? "",
    editorError: active?.error?.message ?? null,
    tabs: ws.tabs.map((t) => ({ title: t.title, query: t.query, active: t.id === ws.activeTabId, error: t.error?.message ?? null })),
    result: active?.result ?? null,
    snippets: useSnippetStore.getState().snippets,
    spaces: ws.spaces.map((s) => ({ name: s.name, tableCount: s.tableCount, current: s.id === ws.spaceId })),
    viewMode: ws.viewMode,
  });
}

function toHistory(messages: AssistantMessage[]): ChatTurn[] {
  return messages.slice(-MAX_HISTORY).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
}

/** Run one assistant query: a single read-only statement, never touching tabs or history. */
async function runReadOnly(sql: string): Promise<AssistantRun> {
  const { executeQuery, splitStatements } = await import("@/lib/duckdb/queries");
  const statements = splitStatements(sql);
  const reason = statements.length !== 1 ? "it has more than one statement" : autoRunRejection(statements[0]);
  if (reason) {
    return {
      sql,
      result: null,
      error: `Not run automatically because ${reason}. Only single plain queries over loaded tables run without a click — show the user this SQL in a sql block instead.`,
    };
  }
  try {
    const result = await executeQuery(statements[0]);
    return { sql, result: { ...result, rows: result.rows.slice(0, RESULT_ROWS_KEPT) }, error: null };
  } catch (err) {
    return { sql, result: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Append messages to one chat by id, whichever chat is open now (an answer must land where it began). */
function commit(chatId: string, spaceId: string | null, append: AssistantMessage[], activate = false) {
  useAssistantStore.setState((state) => {
    if (state.spaceId !== spaceId) return {};
    const existing = state.conversations.find((c) => c.id === chatId);
    // Only the first message creates a chat; a late answer for a deleted chat is dropped.
    if (!existing && !activate) return {};
    const messages = [...(existing?.messages ?? []), ...append].slice(-MAX_STORED);
    const first = messages.find((m) => m.role === "user");
    const conv: Conversation = { id: chatId, title: existing?.title ?? titleOf(first?.content ?? ""), updatedAt: Date.now(), messages };
    const conversations = [conv, ...state.conversations.filter((c) => c.id !== chatId)].slice(0, MAX_CHATS);
    const activeId = activate ? chatId : state.activeId;
    persist(spaceId, activeId, conversations);
    return { conversations, activeId, messages: activeId === chatId ? messages : state.messages };
  });
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  conversations: [],
  activeId: null,
  messages: [],
  draft: "",
  status: "idle",
  error: null,
  spaceId: null,

  loadFor: (spaceId) => {
    if (spaceId === get().spaceId) return;
    get().stop();
    const { activeId, conversations } = spaceId && typeof window !== "undefined" ? load(spaceId) : { activeId: null, conversations: [] };
    const messages = conversations.find((c) => c.id === activeId)?.messages ?? [];
    set({ spaceId, conversations, activeId, messages, draft: "", status: "idle", error: null });
  },

  send: async (text) => {
    const message = text.trim();
    // Callers outside the panel (Home) may send before the panel has loaded this space's chats.
    get().loadFor(useWorkspaceStore.getState().spaceId);
    if (!message || get().status !== "idle") return;
    // Claim the slot before any await so a quick double submit can't start two loops.
    set({ status: "thinking", error: null });
    const { streamComplete } = await import("@/lib/ai/complete");
    const ai = useAiStore.getState();
    await ai.init();
    const { provider, serverProviders } = useAiStore.getState();
    const apiKey = serverProviders.includes(provider) ? undefined : (getApiKey(provider) ?? undefined);
    if (!serverProviders.includes(provider) && !apiKey) {
      set({ status: "idle", error: "This model needs an API key — pick a signed-in model or add a key in the Ask AI bar." });
      return;
    }

    const spaceId = get().spaceId;
    const chatId = get().activeId ?? newId();
    const model = getAiProviderConfig(provider).modelLabel;
    const history = toHistory(get().messages);
    commit(chatId, spaceId, [{ id: newId(), role: "user", content: message, at: Date.now() }], get().activeId === null);
    set({ status: "thinking", draft: "", error: null });
    const mine = new AbortController();
    controller = mine;
    const signal = mine.signal;
    // Only the run that owns the controller, in the chat still open, may touch live state.
    const live = () => controller === mine && get().spaceId === spaceId && get().activeId === chatId;

    // The first turn carries the live workspace state; follow-ups after a query carry its result.
    let input = assistantTurnInput(liveContext(), message);
    const loopHistory = [...history];
    let reply = "";
    try {
      for (let round = 0; round <= MAX_ROUNDS; round++) {
        reply = "";
        for await (const chunk of streamComplete({
          provider,
          apiKey,
          effort: currentEffort(),
          system: ASSISTANT_SYSTEM_PROMPT,
          input,
          history: loopHistory,
          maxTokens: 2048,
          signal,
        })) {
          reply += chunk;
          if (live()) set({ draft: reply });
        }
        const sql = round < MAX_ROUNDS ? extractRunRequest(reply) : null;
        const assistant: AssistantMessage = { id: newId(), role: "assistant", content: reply.trim(), at: Date.now(), model };
        if (!sql) {
          reply = "";
          commit(chatId, spaceId, [assistant]);
          if (live()) set({ draft: "" });
          break;
        }
        if (live()) set({ status: "running-query", draft: "" });
        assistant.run = await runReadOnly(sql);
        if (signal.aborted) throw new DOMException("Stopped", "AbortError");
        const tool: AssistantMessage = {
          id: newId(),
          role: "tool",
          content: runResultMessage(sql, assistant.run.result, assistant.run.error),
          at: Date.now(),
        };
        loopHistory.push({ role: "user", content: input }, { role: "assistant", content: reply });
        reply = "";
        commit(chatId, spaceId, [assistant, tool]);
        if (live()) set({ status: "thinking" });
        input = tool.content;
      }
    } catch (err) {
      if (live() && !signal.aborted) set({ error: err instanceof Error ? err.message : String(err) });
      const partial = reply.trim();
      if (partial) commit(chatId, spaceId, [{ id: newId(), role: "assistant", content: partial, at: Date.now(), model }]);
    } finally {
      if (controller === mine) {
        controller = null;
        if (get().spaceId === spaceId) set({ status: "idle", draft: "" });
      }
    }
  },

  stop: () => controller?.abort(),

  newChat: () => {
    get().stop();
    controller = null;
    set({ activeId: null, messages: [], draft: "", status: "idle", error: null });
    persist(get().spaceId, null, get().conversations);
  },

  switchChat: (id) => {
    const conv = get().conversations.find((c) => c.id === id);
    if (!conv || id === get().activeId) return;
    get().stop();
    controller = null;
    set({ activeId: id, messages: conv.messages, draft: "", status: "idle", error: null });
    persist(get().spaceId, id, get().conversations);
  },

  deleteChat: (id) => {
    if (id === get().activeId) get().newChat();
    const conversations = get().conversations.filter((c) => c.id !== id);
    set({ conversations });
    persist(get().spaceId, get().activeId, conversations);
  },

  reset: () => get().newChat(),
}));

// Follow the open space even while the panel is closed: stop an answer in progress (later
// lookups would run against the new space's tables) and show that space's chats.
useWorkspaceStore.subscribe((state, prev) => {
  if (state.spaceId !== prev.spaceId) useAssistantStore.getState().loadFor(state.spaceId);
});
