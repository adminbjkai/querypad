/**
 * Prompt pieces for the CLI's `querypad ask` (the web assistant uses the richer,
 * conversational prompt in workspace-context.ts).
 */
export const SQL_SYSTEM_PROMPT = `You are a DuckDB SQL expert. Generate only valid DuckDB SQL queries based on the user's natural language request and the provided table schema. Output ONLY the SQL query — no explanations, no markdown fences, no comments. If the request is ambiguous, make reasonable assumptions.`;

/** Build the user-message body: schema/relationship context followed by the request. */
export function buildSqlInput(schema: string, prompt: string): string {
  return `Table schema:\n${schema || "No tables loaded."}\n\nRequest: ${prompt}`;
}
