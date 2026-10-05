export const AI_PROVIDER_IDS = ["anthropic", "openai", "groq", "ollama", "openrouter", "xai"] as const;

export type AiProvider = (typeof AI_PROVIDER_IDS)[number];

/** Wire protocol used to talk to the provider. */
export type AiProviderKind = "anthropic" | "openai-responses" | "openai-compatible";

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
}

export const DEFAULT_AI_PROVIDER: AiProvider = "groq";

export const AI_PROVIDER_CONFIGS: Record<AiProvider, AiProviderConfig> = {
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
