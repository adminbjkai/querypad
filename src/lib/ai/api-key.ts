import { type AiProvider, isAiProvider } from "./providers";

const PROVIDER_STORAGE_KEY = "querypad:ai:provider";
const LEGACY_ANTHROPIC_KEY = "querypad:anthropic-api-key";

function storageKey(provider: AiProvider): string {
  return `querypad:ai:${provider}-api-key`;
}

/** The provider the user picked last, or null if they never chose one. */
export function getStoredAiProvider(): AiProvider | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
  return isAiProvider(stored) ? stored : null;
}


export function setAiProvider(provider: AiProvider): void {
  localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
}

export function getApiKey(provider: AiProvider): string | null {
  if (typeof window === "undefined") return null;

  const key = localStorage.getItem(storageKey(provider));
  if (key) return key;

  if (provider === "anthropic") {
    const legacyKey = localStorage.getItem(LEGACY_ANTHROPIC_KEY);
    if (legacyKey) {
      localStorage.setItem(storageKey("anthropic"), legacyKey);
      localStorage.removeItem(LEGACY_ANTHROPIC_KEY);
      return legacyKey;
    }
  }

  return null;
}

export function setApiKey(provider: AiProvider, key: string): void {
  localStorage.setItem(storageKey(provider), key);
}

export function clearApiKey(provider: AiProvider): void {
  localStorage.removeItem(storageKey(provider));
}

let serverProviders: Promise<AiProvider[]> | null = null;

/**
 * Providers whose keys are configured on the server (GET /api/complete). For these,
 * the browser can call streamComplete without an apiKey and the server proxies the
 * request; the key never reaches the client. Memoized; resolves to [] on failure.
 */
export function fetchServerProviders(): Promise<AiProvider[]> {
  serverProviders ??= fetch("/api/complete", { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) return [];
      const body = (await res.json()) as { providers?: unknown };
      return Array.isArray(body.providers) ? body.providers.filter(isAiProvider) : [];
    })
    .catch(() => []);
  return serverProviders;
}
