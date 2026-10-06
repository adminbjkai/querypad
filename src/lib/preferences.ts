/** Best-effort UI preferences. Restricted storage must not prevent using the workspace. */
export function readPreference(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  } catch {
    // The live UI still works when a browser disables storage or its quota is exhausted.
  }
}
