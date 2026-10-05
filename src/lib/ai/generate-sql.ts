import type { AiProvider } from "./providers";
import { streamComplete } from "./complete";

export const SQL_SYSTEM_PROMPT = `You are a DuckDB SQL expert. Generate only valid DuckDB SQL queries based on the user's natural language request and the provided table schema. Output ONLY the SQL query — no explanations, no markdown fences, no comments. If the request is ambiguous, make reasonable assumptions.`;

interface GenerateSqlOptions {
  provider: AiProvider;
  /** Omit in the browser to use the server-managed key via /api/complete. */
  apiKey?: string;
  prompt: string;
  schema: string;
  signal?: AbortSignal;
}

/** Build the user-message body shared by all providers. */
export function buildSqlInput(schema: string, prompt: string): string {
  return `Table schema:\n${schema || "No tables loaded."}\n\nRequest: ${prompt}`;
}

export async function* generateSql({
  provider,
  apiKey,
  prompt,
  schema,
  signal,
}: GenerateSqlOptions): AsyncGenerator<string> {
  yield* streamComplete({
    provider,
    apiKey,
    system: SQL_SYSTEM_PROMPT,
    input: buildSqlInput(schema, prompt),
    signal,
  });
}
