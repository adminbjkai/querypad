import { create } from "zustand";
import type { ChatTurn } from "@/lib/ai/complete";
import { AGENT_SUMMARY_PROMPT, AGENT_SYSTEM_PROMPT, agentTurnInput, retryInput, summaryInput } from "@/lib/ai/agent-prompt";
import { buildWorkspaceContext } from "@/lib/ai/workspace-context";
import {
  createdObject,
  diffCatalog,
  parsePlan,
  parseSummary,
  toPlanSteps,
  type CatalogDiff,
  type CatalogSnapshot,
  type PlanStep,
  type StepStatus,
} from "@/lib/agent/plan";
import { relationshipKey } from "@/lib/discovery/relationships";
import { getApiKey } from "@/lib/ai/api-key";
import { getAiProviderConfig, type AiProvider } from "@/lib/ai/providers";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast, useUiStore } from "@/stores/ui-store";
import { useAiStore, currentEffort } from "@/stores/ai-store";

/**
 * The Agent page: planning, write-capable sessions over the open space's tables. The model
 * only ever answers with a plan; this store runs the steps through the workbench's query
 * path behind the approval gate (reads run on their own, writes wait unless approvals are
 * "auto", danger steps always wait for the confirmed click, plan-only never runs anything).
 * Sessions persist per space in localStorage like the Assistant's chats.
 */

export type Approvals = "ask" | "auto";
export type SessionStatus = "idle" | "planning" | "running" | "awaiting" | "done" | "error";

export interface UserTurn {
  id: string;
  role: "user";
  content: string;
  at: number;
}

/** Prose only: the agent answered without a plan (a question, or a refusal). */
export interface AgentTurn {
  id: string;
  role: "agent";
  content: string;
  at: number;
  model?: string;
}

export interface PlanTurn {
  id: string;
  role: "plan";
  at: number;
  /** The model's words before the block (Markdown). */
  prose: string;
  summary: string;
  steps: PlanStep[];
  /** The whole reply, replayed to the model as conversation history. */
  raw: string;
  /** Made under Plan mode: shown, never run. */
  planOnly: boolean;
  /** How many times this plan was revised after a failure (max one automatic resume). */
  replans: number;
  model?: string;
}

export interface SummaryTurn {
  id: string;
  role: "summary";
  at: number;
  content: string;
  suggestions: string[];
  diff: CatalogDiff;
  /** Step titles that explain a key choice ("… primary key …"). */
  keys: string[];
  model?: string;
}

export type AgentMessage = UserTurn | AgentTurn | PlanTurn | SummaryTurn;

export interface AgentSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AgentMessage[];
  approvals: Approvals;
  planOnly: boolean;
  status: SessionStatus;
  /** Lower-cased tables/views this session created (the only things it may drop). */
  created: string[];
}

interface AgentState {
  sessions: AgentSession[];
  /** The open session; null is a fresh one that is saved with its first message. */
  activeId: string | null;
  spaceId: string | null;
  /** Settings for the open (or next) session; mirrored into the session record. */
  approvals: Approvals;
  planOnly: boolean;
  /** Text streaming in while planning. */
  draft: string;
  /** What the agent is doing right now, for the status line ("Planning…", "Running step 2 of 5…"). */
  activity: string | null;
  error: string | null;
  loadFor: (spaceId: string | null) => void;
  newSession: () => void;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  send: (text: string) => Promise<void>;
  /** Run (or resume) the latest plan from its first pending step. */
  runPlan: () => void;
  approveStep: (id: string) => void;
  skipStep: (id: string) => void;
  /** Approve the waiting step and every later write (danger steps still ask). */
  approveAll: () => void;
  cancel: () => void;
  /** Send the failed step's error back to the model for a revised plan. */
  retryStep: (id: string) => Promise<void>;
  setApprovals: (approvals: Approvals) => void;
  setPlanOnly: (planOnly: boolean) => void;
  setModel: (provider: AiProvider) => void;
}

const MAX_SESSIONS = 30;
const MAX_MESSAGES = 80;
const MAX_HISTORY = 16;
const storageKey = (spaceId: string) => `querypad:agent:v1:${spaceId}`;
const newId = () => crypto.randomUUID().slice(0, 12);

const titleOf = (text: string) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 59).trimEnd()}…` : t || "New chat";
};

/** A session as saved: transient statuses become idle, result rows optionally dropped. */
function storable(session: AgentSession, keepRows: boolean): AgentSession {
  const status: SessionStatus = session.status === "planning" || session.status === "running" || session.status === "awaiting" ? "idle" : session.status;
  const messages = session.messages.map((m) =>
    m.role !== "plan"
      ? m
      : {
          ...m,
          steps: m.steps.map((s) => ({
            ...s,
            status: s.status === "running" || s.status === "approved" ? ("pending" as StepStatus) : s.status,
            ...(s.result && !keepRows ? { result: { ...s.result, rows: [] } } : {}),
          })),
        }
  );
  return { ...session, status, messages };
}

function persist(spaceId: string | null, activeId: string | null, sessions: AgentSession[]): boolean {
  if (!spaceId || typeof window === "undefined") return false;
  const write = (list: AgentSession[]) => {
    try {
      localStorage.setItem(storageKey(spaceId), JSON.stringify({ activeId, sessions: list }));
      return true;
    } catch {
      return false;
    }
  };
  if (write(sessions.map((s) => storable(s, true)))) return true;
  let list = sessions.map((s) => storable(s, false));
  while (list.length > 0) {
    if (write(list)) return true;
    const oldest = list.findLastIndex((s) => s.id !== activeId);
    if (oldest < 0) break;
    list = list.filter((_, i) => i !== oldest);
  }
  return false;
}

function load(spaceId: string): { activeId: string | null; sessions: AgentSession[] } {
  try {
    const raw = localStorage.getItem(storageKey(spaceId));
    if (!raw) return { activeId: null, sessions: [] };
    const data = JSON.parse(raw) as { activeId?: string | null; sessions?: AgentSession[] };
    const sessions = (Array.isArray(data.sessions) ? data.sessions : [])
      .filter((s) => s && Array.isArray(s.messages))
      .map((s) => storable({ ...s, created: Array.isArray(s.created) ? s.created : [], approvals: s.approvals === "auto" ? "auto" : "ask", planOnly: !!s.planOnly }, true));
    const activeId = sessions.some((s) => s.id === data.activeId) ? (data.activeId ?? null) : null;
    return { activeId, sessions };
  } catch {
    return { activeId: null, sessions: [] };
  }
}

/** Everything the agent should know right now, read fresh from the workspace store. */
function liveContext(): string {
  const ws = useWorkspaceStore.getState();
  return buildWorkspaceContext({
    tables: ws.tables,
    views: ws.views,
    profiles: Object.fromEntries(Object.entries(ws.tableProfiles).map(([name, p]) => [name, p.profile])),
    relationships: ws.discovery.relationships,
    verdicts: ws.relationshipVerdicts,
    relationshipKey,
    log: ws.history,
    editorQuery: "",
    editorError: null,
  });
}

function toHistory(messages: AgentMessage[]): ChatTurn[] {
  return messages.slice(-MAX_HISTORY).map((m) => {
    if (m.role === "user") return { role: "user", content: m.content };
    if (m.role === "plan") return { role: "assistant", content: m.raw };
    return { role: "assistant", content: m.content };
  });
}

const latestPlan = (session: AgentSession | undefined): PlanTurn | undefined =>
  session?.messages.findLast((m): m is PlanTurn => m.role === "plan");

// --- The one run in progress (module state: never persisted) ----------------------------

interface Run {
  sessionId: string;
  spaceId: string | null;
  controller: AbortController;
  /** Writes no longer wait after "Run all remaining" (danger steps still do). */
  allRemaining: boolean;
  /** The catalog when the plan started, for the diff in the summary. */
  before: CatalogSnapshot;
  request: string;
  cancelled: boolean;
}

let run: Run | null = null;

/** Update one session wherever it is in the list (an answer must land where it began). */
function patchSession(sessionId: string, spaceId: string | null, fn: (s: AgentSession) => Partial<AgentSession>, bump = true) {
  useAgentStore.setState((state) => {
    if (state.spaceId !== spaceId) return {};
    const existing = state.sessions.find((s) => s.id === sessionId);
    if (!existing) return {};
    const next = { ...existing, ...fn(existing), ...(bump ? { updatedAt: Date.now() } : {}) };
    const sessions = bump ? [next, ...state.sessions.filter((s) => s.id !== sessionId)] : state.sessions.map((s) => (s.id === sessionId ? next : s));
    persist(spaceId, state.activeId, sessions);
    return { sessions };
  });
}

function appendMessages(sessionId: string, spaceId: string | null, append: AgentMessage[], patch: Partial<AgentSession> = {}) {
  patchSession(sessionId, spaceId, (s) => ({ ...patch, messages: [...s.messages, ...append].slice(-MAX_MESSAGES) }));
}

function patchStep(sessionId: string, spaceId: string | null, planId: string, stepId: string, patch: Partial<PlanStep>) {
  patchSession(
    sessionId,
    spaceId,
    (s) => ({
      messages: s.messages.map((m) => (m.role === "plan" && m.id === planId ? { ...m, steps: m.steps.map((st) => (st.id === stepId ? { ...st, ...patch } : st)) } : m)),
    }),
    false
  );
}

async function modelReady(): Promise<{ provider: AiProvider; apiKey: string | undefined; model: string } | string> {
  const ai = useAiStore.getState();
  await ai.init();
  const { provider, serverProviders } = useAiStore.getState();
  const apiKey = serverProviders.includes(provider) ? undefined : (getApiKey(provider) ?? undefined);
  if (!serverProviders.includes(provider) && !apiKey) return "This model needs an API key — pick a signed-in model or add a key in the Ask AI bar.";
  return { provider, apiKey, model: getAiProviderConfig(provider).modelLabel };
}

async function ask(system: string, input: string, history: ChatTurn[], signal: AbortSignal, onDraft: (text: string) => void): Promise<string> {
  const { streamComplete } = await import("@/lib/ai/complete");
  const ready = await modelReady();
  if (typeof ready === "string") throw new Error(ready);
  let reply = "";
  for await (const chunk of streamComplete({
    provider: ready.provider,
    apiKey: ready.apiKey,
    effort: currentEffort(),
    system,
    input,
    history,
    maxTokens: 4096,
    signal,
  })) {
    reply += chunk;
    onDraft(reply);
  }
  return reply;
}

const KEY_WORDS = /\b(primary key|foreign key|key)\b/i;

export const useAgentStore = create<AgentState>((set, get) => ({
  sessions: [],
  activeId: null,
  spaceId: null,
  approvals: "ask",
  planOnly: false,
  draft: "",
  activity: null,
  error: null,

  loadFor: (spaceId) => {
    if (spaceId === get().spaceId) return;
    get().cancel();
    const { activeId, sessions } = spaceId && typeof window !== "undefined" ? load(spaceId) : { activeId: null, sessions: [] };
    const active = sessions.find((s) => s.id === activeId);
    set({ spaceId, sessions, activeId, draft: "", activity: null, error: null, approvals: active?.approvals ?? get().approvals, planOnly: active?.planOnly ?? get().planOnly });
  },

  newSession: () => {
    get().cancel();
    set({ activeId: null, draft: "", activity: null, error: null });
    persist(get().spaceId, null, get().sessions);
  },

  switchSession: (id) => {
    const session = get().sessions.find((s) => s.id === id);
    if (!session || id === get().activeId) return;
    get().cancel();
    set({ activeId: id, draft: "", activity: null, error: null, approvals: session.approvals, planOnly: session.planOnly });
    persist(get().spaceId, id, get().sessions);
  },

  deleteSession: (id) => {
    if (id === get().activeId) get().newSession();
    const sessions = get().sessions.filter((s) => s.id !== id);
    set({ sessions });
    persist(get().spaceId, get().activeId, sessions);
  },

  send: async (text) => {
    const message = text.trim();
    get().loadFor(useWorkspaceStore.getState().spaceId);
    if (!message) return;
    const spaceId = get().spaceId;
    const current = get().sessions.find((s) => s.id === get().activeId);
    if (current && (current.status === "planning" || current.status === "running")) return;
    // A new request while a plan waits for approval abandons that run (its plan can be resumed later).
    if (current?.status === "awaiting") get().cancel();

    const sessionId = current?.id ?? newId();
    const { approvals, planOnly } = get();
    const userTurn: UserTurn = { id: newId(), role: "user", content: message, at: Date.now() };
    if (!current) {
      const session: AgentSession = {
        id: sessionId,
        title: titleOf(message),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [userTurn],
        approvals,
        planOnly,
        status: "planning",
        created: [],
      };
      set((state) => {
        const sessions = [session, ...state.sessions].slice(0, MAX_SESSIONS);
        persist(spaceId, sessionId, sessions);
        return { sessions, activeId: sessionId };
      });
    } else {
      appendMessages(sessionId, spaceId, [userTurn], { status: "planning", approvals, planOnly });
    }
    set({ draft: "", activity: "Planning…", error: null });

    const controller = new AbortController();
    run = { sessionId, spaceId, controller, allRemaining: false, before: catalogNow(), request: message, cancelled: false };
    const mine = run;
    const live = () => run === mine && get().spaceId === spaceId && get().activeId === sessionId;
    const history = toHistory(current?.messages ?? []);
    const input = agentTurnInput(liveContext(), message, current?.created ?? []);
    await plan(mine, input, history, live, null);
  },

  runPlan: () => {
    const session = get().sessions.find((s) => s.id === get().activeId);
    const planTurn = latestPlan(session);
    if (!session || !planTurn || planTurn.planOnly) return;
    if (session.status === "planning" || session.status === "running") return;
    if (!planTurn.steps.some((s) => s.status === "pending" || s.status === "approved")) return;
    if (!run || run.sessionId !== session.id) {
      const request = session.messages.findLast((m): m is UserTurn => m.role === "user")?.content ?? "";
      run = { sessionId: session.id, spaceId: get().spaceId, controller: new AbortController(), allRemaining: false, before: catalogNow(), request, cancelled: false };
    }
    void advance(run);
  },

  approveStep: (id) => {
    const session = get().sessions.find((s) => s.id === get().activeId);
    const planTurn = latestPlan(session);
    if (!session || !planTurn || !run || run.sessionId !== session.id) return;
    patchStep(session.id, get().spaceId, planTurn.id, id, { status: "approved" });
    void advance(run);
  },

  skipStep: (id) => {
    const session = get().sessions.find((s) => s.id === get().activeId);
    const planTurn = latestPlan(session);
    if (!session || !planTurn || !run || run.sessionId !== session.id) return;
    patchStep(session.id, get().spaceId, planTurn.id, id, { status: "skipped" });
    void advance(run);
  },

  approveAll: () => {
    const session = get().sessions.find((s) => s.id === get().activeId);
    const planTurn = latestPlan(session);
    if (!session || !planTurn || !run || run.sessionId !== session.id) return;
    run.allRemaining = true;
    const waiting = planTurn.steps.find((s) => s.status === "pending");
    if (waiting && waiting.kind !== "danger") patchStep(session.id, get().spaceId, planTurn.id, waiting.id, { status: "approved" });
    void advance(run);
  },

  cancel: () => {
    const current = run;
    if (!current) return;
    current.cancelled = true;
    current.controller.abort();
    run = null;
    patchSession(
      current.sessionId,
      current.spaceId,
      (s) => ({
        status: s.status === "planning" || s.status === "running" || s.status === "awaiting" ? "idle" : s.status,
        messages: s.messages.map((m) =>
          m.role === "plan" ? { ...m, steps: m.steps.map((st) => (st.status === "approved" ? { ...st, status: "pending" as StepStatus } : st)) } : m
        ),
      }),
      false
    );
    set({ draft: "", activity: null });
  },

  retryStep: async (id) => {
    const session = get().sessions.find((s) => s.id === get().activeId);
    const planTurn = latestPlan(session);
    const failed = planTurn?.steps.find((s) => s.id === id);
    if (!session || !planTurn || !failed || failed.status !== "error") return;
    if (session.status === "planning" || session.status === "running") return;
    const spaceId = get().spaceId;
    const before = run?.sessionId === session.id ? run.before : catalogNow();
    const request = session.messages.findLast((m): m is UserTurn => m.role === "user")?.content ?? "";
    // The old plan goes inert; the revised one takes over from the corrected step.
    patchSession(session.id, spaceId, (s) => ({
      status: "planning",
      messages: s.messages.map((m) =>
        m.role === "plan" && m.id === planTurn.id ? { ...m, steps: m.steps.map((st) => (st.status === "pending" ? { ...st, status: "skipped" as StepStatus } : st)) } : m
      ),
    }));
    set({ draft: "", activity: "Revising the plan…", error: null });
    const controller = new AbortController();
    run = { sessionId: session.id, spaceId, controller, allRemaining: false, before, request, cancelled: false };
    const mine = run;
    const live = () => run === mine && get().spaceId === spaceId && get().activeId === session.id;
    const input = retryInput(liveContext(), planTurn.steps, failed, session.created);
    await plan(mine, input, toHistory(session.messages), live, planTurn);
  },

  setApprovals: (approvals) => {
    set({ approvals });
    const id = get().activeId;
    if (id) patchSession(id, get().spaceId, () => ({ approvals }), false);
  },

  setPlanOnly: (planOnly) => {
    set({ planOnly });
    const id = get().activeId;
    if (id) patchSession(id, get().spaceId, () => ({ planOnly }), false);
  },

  setModel: (provider) => useAiStore.getState().setProvider(provider),
}));

function catalogNow(): CatalogSnapshot {
  const ws = useWorkspaceStore.getState();
  return { tables: ws.tables.map((t) => ({ name: t.name, rowCount: t.rowCount })), views: ws.views.map((v) => v.name) };
}

/** Ask the model for a plan (first turn or a revision), store it, and start it when allowed. */
async function plan(mine: Run, input: string, history: ChatTurn[], live: () => boolean, revising: PlanTurn | null) {
  const { sessionId, spaceId, controller } = mine;
  const set = useAgentStore.setState;
  const get = useAgentStore.getState;
  let reply = "";
  try {
    reply = await ask(AGENT_SYSTEM_PROMPT, input, history, controller.signal, (text) => {
      reply = text;
      if (live()) set({ draft: text });
    });
    if (mine.cancelled) return;
    const parsed = parsePlan(reply);
    const model = getAiProviderConfig(useAiStore.getState().provider).modelLabel;
    const session = get().sessions.find((s) => s.id === sessionId);
    const planOnly = session?.planOnly ?? false;
    if (!parsed.plan) {
      appendMessages(sessionId, spaceId, [{ id: newId(), role: "agent", content: reply.trim(), at: Date.now(), model }], { status: "done" });
      if (live()) set({ draft: "", activity: null });
      run = null;
      return;
    }
    const turn: PlanTurn = {
      id: newId(),
      role: "plan",
      at: Date.now(),
      prose: parsed.prose,
      summary: parsed.plan.summary,
      steps: toPlanSteps(parsed.plan, newId),
      raw: reply.trim(),
      planOnly,
      replans: revising ? revising.replans + 1 : 0,
      model,
    };
    appendMessages(sessionId, spaceId, [turn], { status: planOnly ? "done" : "idle" });
    if (live()) set({ draft: "", activity: null });
    if (planOnly) {
      run = null;
      return;
    }
    // The first revision resumes on its own; after that the user decides.
    if (revising && turn.replans <= 1 && run === mine) await advance(mine);
  } catch (err) {
    if (mine.cancelled) return;
    const message = err instanceof Error ? err.message : String(err);
    if (live()) set({ error: message, draft: "", activity: null });
    const partial = reply.trim();
    patchSession(sessionId, spaceId, (s) => ({
      status: "error",
      messages: partial ? [...s.messages, { id: newId(), role: "agent" as const, content: partial, at: Date.now() }] : s.messages,
    }));
    if (run === mine) run = null;
  }
}

/** Run steps in order until one needs approval, fails, or the plan is finished. */
async function advance(mine: Run) {
  if (run !== mine) return;
  const { sessionId, spaceId } = mine;
  const get = useAgentStore.getState;
  const set = useAgentStore.setState;
  const live = () => run === mine && get().activeId === sessionId;
  const { runNotebookStep, runStep } = await import("@/lib/agent/run");

  while (run === mine && !mine.cancelled) {
    const session = get().sessions.find((s) => s.id === sessionId);
    const planTurn = latestPlan(session);
    if (!session || !planTurn || planTurn.planOnly) {
      run = null;
      return;
    }
    const steps = planTurn.steps;
    const index = steps.findIndex((s) => s.status === "pending" || s.status === "approved");
    if (index < 0) {
      await finish(mine, planTurn);
      return;
    }
    const step = steps[index];
    const approvals = session.approvals;
    const mayRun =
      step.status === "approved" || step.kind === "read" || (step.kind === "write" && (approvals === "auto" || mine.allRemaining));
    if (!mayRun) {
      patchSession(sessionId, spaceId, () => ({ status: "awaiting" }), false);
      if (live()) set({ activity: null });
      return;
    }
    patchStep(sessionId, spaceId, planTurn.id, step.id, { status: "running", error: undefined });
    patchSession(sessionId, spaceId, () => ({ status: "running" }), false);
    if (live()) set({ activity: `Running step ${index + 1} of ${steps.length}…`, error: null });
    try {
      const result = step.notebook ? await runNotebookStep(step.notebook) : await runStep(step.sql);
      const made = step.notebook ? null : createdObject(step.sql);
      patchStep(sessionId, spaceId, planTurn.id, step.id, { status: "ok", result });
      if (made) patchSession(sessionId, spaceId, (s) => ({ created: s.created.includes(made) ? s.created : [...s.created, made] }), false);
      if (result.notebookId) {
        const name = String(result.rows[0]?.notebook ?? step.notebook?.name ?? "Notebook");
        toast(`Created notebook ${name}.`);
        const later = steps.slice(index + 1).some((s) => s.status === "pending" || s.status === "approved");
        if (!later) useUiStore.getState().openNotebook(result.notebookId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      patchStep(sessionId, spaceId, planTurn.id, step.id, { status: "error", error: message });
      if (!mine.cancelled) patchSession(sessionId, spaceId, () => ({ status: "error" }), false);
      if (live()) set({ activity: null });
      return;
    }
    if (mine.cancelled) {
      patchSession(sessionId, spaceId, () => ({ status: "idle" }), false);
      return;
    }
  }
}

/** Every step is done: measure what changed and ask the model for the closing note. */
async function finish(mine: Run, planTurn: PlanTurn) {
  const { sessionId, spaceId, controller } = mine;
  const get = useAgentStore.getState;
  const set = useAgentStore.setState;
  const live = () => run === mine && get().activeId === sessionId;
  const diff = diffCatalog(mine.before, catalogNow());
  const keys = planTurn.steps.filter((s) => s.status === "ok" && KEY_WORDS.test(s.title)).map((s) => s.title);
  if (live()) set({ activity: "Writing the summary…" });
  patchSession(sessionId, spaceId, () => ({ status: "running" }), false);
  let turn: SummaryTurn;
  try {
    const session = get().sessions.find((s) => s.id === sessionId);
    const reply = await ask(AGENT_SUMMARY_PROMPT, summaryInput(mine.request, planTurn.steps, diff), toHistory(session?.messages ?? []), controller.signal, () => {});
    if (mine.cancelled) return;
    const parsed = parseSummary(reply);
    turn = { id: newId(), role: "summary", at: Date.now(), content: parsed.text, suggestions: parsed.suggestions, diff, keys, model: getAiProviderConfig(useAiStore.getState().provider).modelLabel };
  } catch (err) {
    if (mine.cancelled) return;
    const ok = planTurn.steps.filter((s) => s.status === "ok").length;
    turn = { id: newId(), role: "summary", at: Date.now(), content: `${ok} of ${planTurn.steps.length} steps ran.`, suggestions: [], diff, keys };
    if (live()) set({ error: err instanceof Error ? err.message : String(err) });
  }
  appendMessages(sessionId, spaceId, [turn], { status: "done" });
  if (live()) set({ activity: null });
  if (run === mine) run = null;
}

// Follow the open space: abandon a run in progress (later steps would hit the new space's
// tables) and show that space's sessions.
useWorkspaceStore.subscribe((state, prev) => {
  if (state.spaceId !== prev.spaceId) useAgentStore.getState().loadFor(state.spaceId);
});
