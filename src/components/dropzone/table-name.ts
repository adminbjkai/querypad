const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Why a proposed table name can't be used (empty, not identifier-safe, or taken by `others`), or null when it's fine. */
export function tableNameProblem(name: string, others: string[]): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a table name.";
  if (!IDENTIFIER.test(trimmed)) return "Use letters, digits and underscores, not starting with a digit.";
  if (others.some((o) => o.toLowerCase() === trimmed.toLowerCase())) return "Another file above already uses this name.";
  return null;
}
