export const AI_PROVIDER_IDS = [
  "local-claude",
  "local-codex",
  "local-grok",
  "local-cursor-grok",
  "local-cursor-composer",
  "anthropic",
  "openai",
  "groq",
  "ollama",
  "openrouter",
  "xai",
] as const;

export type AiProvider = (typeof AI_PROVIDER_IDS)[number];

/** Wire protocol used to talk to the provider. */
export type AiProviderKind = "anthropic" | "openai-responses" | "openai-compatible" | "local";

/** Reasoning effort for models that offer a choice (local CLIs). */
export type AiEffort = "low" | "medium";

export interface AiProviderConfig {
  id: AiProvider;
  label: string;
  modelLabel: string;
  model: string;
  kind: AiProviderKind;
  /** API root, e.g. https://api.x.ai/v1 (endpoint paths are appended per kind). */
  baseUrl: string;
  /** Environment variable holding the key (CLI and server-managed route). */
  envKey: string;
  keyPlaceholder: string;
  keyUrl: string;
  /** Extra fields merged into the request body (provider-specific tuning). */
  extraBody?: Record<string, unknown>;
  /**
   * kind "local": a CLI already signed in on the QueryPad host (Claude Code, Codex, Grok,
   * Cursor), reached through the local AI bridge — no API key. `bridgeModel` is the
   * bridge's model id; `efforts` lists the selectable reasoning efforts (empty = fixed).
   */
  bridgeModel?: string;
  efforts?: AiEffort[];
  /** Group shown in the model picker, e.g. "Cursor". */
  vendor?: string;
}

function local(
  id: AiProvider,
  vendor: string,
  modelLabel: string,
  bridgeModel: string,
  efforts: AiEffort[]
): AiProviderConfig {
  return {
    id,
    label: vendor,
    modelLabel,
    model: bridgeModel,
    kind: "local",
    baseUrl: "",
    envKey: "",
    keyPlaceholder: "",
    keyUrl: "",
    bridgeModel,
    efforts,
    vendor,
  };
}

export const DEFAULT_AI_PROVIDER: AiProvider = "groq";

const AI_PROVIDER_CONFIGS: Record<AiProvider, AiProviderConfig> = {
  "local-claude": local("local-claude", "Claude", "Sonnet 5.5", "claude-sonnet-5-5", ["low", "medium"]),
  "local-codex": local("local-codex", "Codex", "GPT-6 Luna", "codex-gpt-6-luna", ["low", "medium"]),
  "local-grok": local("local-grok", "Grok", "Grok 4.7", "grok-4-7", ["low", "medium"]),
  "local-cursor-grok": local("local-cursor-grok", "Cursor", "Grok 4.7 Medium Fast (256k)", "cursor-grok-4-7-medium-fast", []),
  "local-cursor-composer": local("local-cursor-composer", "Cursor", "Composer 2.5", "cursor-composer-2-5", []),
  anthropic: {
    id: "anthropic",
    label: "Claude",
    modelLabel: "Sonnet 5.5",
    model: "claude-sonnet-5-5",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    envKey: "ANTHROPIC_API_KEY",
    keyPlaceholder: "Enter your Anthropic API key (sk-ant-...)",
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    modelLabel: "GPT-5.5",
    model: "gpt-5.5",
    kind: "openai-responses",
    baseUrl: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
    keyPlaceholder: "Enter your OpenAI API key (sk-...)",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  groq: {
    id: "groq",
    label: "Groq",
    modelLabel: "GPT OSS 120B",
    model: "openai/gpt-oss-120b",
    kind: "openai-compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    envKey: "GROQ_API_KEY",
    keyPlaceholder: "Enter your Groq API key (gsk_...)",
    keyUrl: "https://console.groq.com/keys",
    extraBody: { reasoning_effort: "low" },
  },
  ollama: {
    id: "ollama",
    label: "Ollama Cloud",
    modelLabel: "DeepSeek V4.1 Flash",
    model: "deepseek-v4.1-flash",
    kind: "openai-compatible",
    baseUrl: "https://ollama.com/v1",
    envKey: "OLLAMA_API_KEY",
    keyPlaceholder: "Enter your Ollama API key",
    keyUrl: "https://ollama.com/settings/keys",
    extraBody: { reasoning_effort: "none" },
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    modelLabel: "DeepSeek V4.1 Flash",
    model: "deepseek/deepseek-v4.1-flash",
    kind: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    envKey: "OPENROUTER_API_KEY",
    keyPlaceholder: "Enter your OpenRouter API key (sk-or-...)",
    keyUrl: "https://openrouter.ai/keys",
    extraBody: { reasoning: { enabled: false } },
  },
  xai: {
    id: "xai",
    label: "xAI Grok",
    modelLabel: "Grok 4.7",
    model: "grok-4.7",
    kind: "openai-compatible",
    baseUrl: "https://api.x.ai/v1",
    envKey: "XAI_API_KEY",
    keyPlaceholder: "Enter your xAI API key (xai-...)",
    keyUrl: "https://console.x.ai",
  },
};

export const AI_PROVIDER_OPTIONS = AI_PROVIDER_IDS.map((id) => AI_PROVIDER_CONFIGS[id]);

export function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

export function getAiProviderConfig(provider: AiProvider): AiProviderConfig {
  return AI_PROVIDER_CONFIGS[provider];
}

/** Providers that work with an API key (everything except the host's signed-in CLIs). */
export const KEY_PROVIDER_OPTIONS = AI_PROVIDER_OPTIONS.filter((p) => p.kind !== "local");
