import type { AiProvider } from "../lib/ai/providers";
import {
  AI_PROVIDER_IDS,
  DEFAULT_AI_PROVIDER,
  getAiProviderConfig,
  isAiProvider,
} from "../lib/ai/providers";

export interface AiCredentials {
  provider: AiProvider;
  apiKey: string;
}

/**
 * Resolve the AI provider + API key for the CLI from flags and environment.
 * Precedence: explicit `provider` arg → `QUERYPAD_AI_PROVIDER` → DEFAULT_AI_PROVIDER.
 * The key comes from the provider's env var (see the provider table).
 */
export function resolveAiCredentials(provider?: string): AiCredentials {
  const selected = provider || process.env.QUERYPAD_AI_PROVIDER || DEFAULT_AI_PROVIDER;

  if (!isAiProvider(selected)) {
    throw new Error(
      `Unknown AI provider "${selected}". Use one of: ${AI_PROVIDER_IDS.filter((id) => getAiProviderConfig(id).kind !== "local").join(", ")}.`
    );
  }

  const { envKey, kind } = getAiProviderConfig(selected);
  if (kind === "local") {
    throw new Error(`"${selected}" uses the web app's local AI bridge and isn't available in the CLI.`);
  }
  const apiKey = process.env[envKey];
  if (!apiKey) {
    throw new Error(
      `Missing API key for ${selected}. Set ${envKey} in your environment, ` +
        `e.g. \`${envKey}=... querypad ask "..." --provider ${selected}\`.`
    );
  }

  return { provider: selected, apiKey };
}
