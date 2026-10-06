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
}

interface AssistantState {
  /** Messages of the open space's conversation (tool messages are not shown). */
  messages: AssistantMessage[];
  /** Text streaming in for the reply being written. */
  draft: string;
  status: "idle" | "thinking" | "running-query";
  error: string | null;
  /** Ids of action blocks the user already applied (`messageId:index`). */
  applied: Record<string, boolean>;
  spaceId: string | null;
  loadFor: (spaceId: string | null) => void;
  send: (text: string) => Promise<void>;
  stop: () => void;
  reset: () => void;
  markApplied: (key: string) => void;
}

const MAX_ROUNDS = 3;
const MAX_STORED = 80;
const MAX_HISTORY = 16;
const RESULT_ROWS_KEPT = 50;
const storageKey = (spaceId: string) => `querypad:assistant:${spaceId}`;

let controller: AbortController | null = null;

function persist(spaceId: string | null, messages: AssistantMessage[]) {
  if (!spaceId || typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(spaceId), JSON.stringify(messages.slice(-MAX_STORED)));
  } catch {
    // storage full: the conversation still works for this session
  }
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
      error: `Not run automatically because ${reason}. Only single plain queries over loaded tables run without a click — give the user this SQL in a sql block instead.`,
    };
  }
  try {
    const result = await executeQuery(statements[0]);
    return { sql, result: { ...result, rows: result.rows.slice(0, RESULT_ROWS_KEPT) }, error: null };
  } catch (err) {
    return { sql, result: null, error: err instanceof Error ? err.message : String(err) };
  }
}

const newId = () => crypto.randomUUID().slice(0, 12);

export const useAssistantStore = create<AssistantState>((set, get) => ({
  messages: [],
  draft: "",
  status: "idle",
  error: null,
  applied: {},
  spaceId: null,

  loadFor: (spaceId) => {
    if (spaceId === get().spaceId) return;
    get().stop();
    let messages: AssistantMessage[] = [];
    if (spaceId && typeof window !== "undefined") {
      try {
        messages = JSON.parse(localStorage.getItem(storageKey(spaceId)) ?? "[]") as AssistantMessage[];
      } catch {
        messages = [];
      }
    }
    set({ spaceId, messages, draft: "", status: "idle", error: null, applied: {} });
  },

  send: async (text) => {
    const message = text.trim();
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
    const user: AssistantMessage = { id: newId(), role: "user", content: message, at: Date.now() };
    const history = toHistory(get().messages);
    set({ messages: [...get().messages, user], status: "thinking", draft: "", error: null });
    controller = new AbortController();
    const signal = controller.signal;

    // The first turn carries the live workspace state; follow-ups after a query carry its result.
    let input = assistantTurnInput(liveContext(), message);
    const loopHistory = [...history];
    try {
      for (let round = 0; round <= MAX_ROUNDS; round++) {
        let reply = "";
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
          set({ draft: reply });
        }
        const sql = round < MAX_ROUNDS ? extractRunRequest(reply) : null;
        const assistant: AssistantMessage = { id: newId(), role: "assistant", content: reply.trim(), at: Date.now() };
        if (!sql) {
          set({ messages: [...get().messages, assistant], draft: "" });
          break;
        }
        set({ status: "running-query", draft: "" });
        assistant.run = await runReadOnly(sql);
        if (signal.aborted) throw new DOMException("Stopped", "AbortError");
        const tool: AssistantMessage = {
          id: newId(),
          role: "tool",
          content: runResultMessage(sql, assistant.run.result, assistant.run.error),
          at: Date.now(),
        };
        set({ messages: [...get().messages, assistant, tool], status: "thinking" });
        loopHistory.push({ role: "user", content: input }, { role: "assistant", content: reply });
        input = tool.content;
      }
    } catch (err) {
      if (get().spaceId !== spaceId) return;
      if (!signal.aborted) set({ error: err instanceof Error ? err.message : String(err) });
      const partial = get().draft.trim();
      if (partial) set({ messages: [...get().messages, { id: newId(), role: "assistant", content: partial, at: Date.now() }] });
    } finally {
      controller = null;
      if (get().spaceId === spaceId) set({ status: "idle", draft: "" });
      // A space switch mid-answer must not write this conversation into the other space.
      if (get().spaceId === spaceId) persist(spaceId, get().messages);
    }
  },

  stop: () => controller?.abort(),

  reset: () => {
    get().stop();
    set({ messages: [], draft: "", error: null, applied: {} });
    persist(get().spaceId, []);
  },

  markApplied: (key) => set({ applied: { ...get().applied, [key]: true } }),
}));

// Stop an answer in progress when the space changes, even if the panel is closed — later
// lookups would otherwise run against the new space's tables.
useWorkspaceStore.subscribe((state, prev) => {
  if (state.spaceId !== prev.spaceId) useAssistantStore.getState().stop();
});
