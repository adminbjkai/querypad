import { create } from "zustand";
import {
  AI_PROVIDER_IDS,
  DEFAULT_AI_PROVIDER,
  getAiProviderConfig,
  isAiProvider,
  type AiEffort,
  type AiProvider,
} from "@/lib/ai/providers";
import { fetchServerProviders, getApiKey, getStoredAiProvider, setAiProvider } from "@/lib/ai/api-key";

const EFFORT_KEY = "querypad:ai:efforts";

/** Preferred defaults when the user hasn't chosen: signed-in CLIs first, Claude first. */
const PREFERENCE: AiProvider[] = [
  "local-claude",
  "local-codex",
  "local-grok",
  "local-cursor-grok",
  "local-cursor-composer",
  ...AI_PROVIDER_IDS.filter((id) => !id.startsWith("local-")),
];

interface AiState {
  provider: AiProvider;
  efforts: Partial<Record<AiProvider, AiEffort>>;
  /** Providers the server can run without a browser key (server keys + local CLIs). */
  serverProviders: AiProvider[];
  loaded: boolean;
  init: () => Promise<void>;
  setProvider: (provider: AiProvider) => void;
  setEffort: (provider: AiProvider, effort: AiEffort) => void;
}

function readEfforts(): Partial<Record<AiProvider, AiEffort>> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(EFFORT_KEY) ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([id, e]) => isAiProvider(id) && (e === "low" || e === "medium"))
    ) as Partial<Record<AiProvider, AiEffort>>;
  } catch {
    return {};
  }
}

/** Human label of a provider + effort, e.g. "Claude · Sonnet 5.5 · low". */
export function modelLabel(provider: AiProvider, effort?: AiEffort): string {
  const config = getAiProviderConfig(provider);
  const base = `${config.label} · ${config.modelLabel}`;
  return config.efforts?.length ? `${base} · ${effort ?? config.efforts[0]}` : base;
}

export const useAiStore = create<AiState>((set, get) => ({
  provider: DEFAULT_AI_PROVIDER,
  efforts: readEfforts(),
  serverProviders: [],
  loaded: false,

  init: async () => {
    if (get().loaded) return;
    const available = await fetchServerProviders();
    const stored = getStoredAiProvider();
    // Keep the user's choice if it still works; otherwise the best one that needs no setup.
    const usable = (id: AiProvider) => available.includes(id) || (!id.startsWith("local-") && !!getApiKey(id));
    const provider =
      stored && usable(stored) ? stored : (PREFERENCE.find((id) => available.includes(id)) ?? stored ?? DEFAULT_AI_PROVIDER);
    set({ serverProviders: available, provider, loaded: true });
  },

  setProvider: (provider) => {
    setAiProvider(provider);
    set({ provider });
  },

  setEffort: (provider, effort) => {
    const efforts = { ...get().efforts, [provider]: effort };
    localStorage.setItem(EFFORT_KEY, JSON.stringify(efforts));
    set({ efforts });
  },
}));

/** The effort to send for the current provider (undefined when the model has no choice). */
export function currentEffort(): AiEffort | undefined {
  const { provider, efforts } = useAiStore.getState();
  const options = getAiProviderConfig(provider).efforts ?? [];
  if (options.length === 0) return undefined;
  const chosen = efforts[provider];
  return chosen && options.includes(chosen) ? chosen : options[0];
}
