import type { QueryResult } from "@/types";
import { formatValue } from "@/lib/utils";

/** Copy text with a fallback for non-secure contexts (plain-http dev hosts). */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

/** Copy a result as TSV — pastes cleanly into spreadsheets. */
export async function copyToClipboard(result: QueryResult): Promise<void> {
  const header = result.columns.join("\t");
  const rows = result.rows.map((row) =>
    result.columns.map((col) => formatValue(row[col])).join("\t")
  );
  await copyText([header, ...rows].join("\n"));
}
