"use client";

import { useState } from "react";
import { loadRemoteFileAsTable } from "@/lib/duckdb/remote";
import { sanitizeTableName } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast } from "@/stores/ui-store";
import { Spinner, btn, input } from "@/components/ui/primitives";
import { tableNameProblem } from "./table-name";

/** The table name a URL would get by default: its last path segment, made identifier-safe. */
function nameFromUrl(url: string): string {
  try {
    const parts = new URL(url.trim()).pathname.split("/").filter(Boolean);
    return sanitizeTableName(parts[parts.length - 1] || "remote_data");
  } catch {
    return "";
  }
}

/** Load a file from a public URL (the server must allow cross-origin requests). */
export default function UrlInput({ onAdded, withName }: { onAdded?: () => void; withName?: boolean }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addTable = useWorkspaceStore((s) => s.addTable);
  const existing = useWorkspaceStore((s) => s.tables);

  const tableName = withName ? (nameEdited ? name : nameFromUrl(url)) : "";
  const problem = withName && url.trim() ? tableNameProblem(tableName, []) : null;
  const replaces = withName && !problem && existing.some((t) => t.name.toLowerCase() === tableName.trim().toLowerCase());

  const load = async () => {
    const trimmed = url.trim();
    if (!trimmed || problem) return;
    setLoading(true);
    setError(null);
    try {
      const { table, fileName, data } = await loadRemoteFileAsTable(trimmed, withName ? tableName.trim() : undefined);
      addTable(table, fileName, data);
      toast(`Added table ${table.name}.`, "success");
      setUrl("");
      setName("");
      setNameEdited(false);
      onAdded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/data.parquet"
            className={input}
            disabled={loading}
            aria-label="File URL"
          />
          <button type="submit" disabled={loading || !url.trim() || !!problem} className={btn.secondary}>
            {loading ? <Spinner /> : "Load"}
          </button>
        </div>
        {withName && (
          <div className="flex items-center gap-2">
            <label htmlFor="url-table-name" className="shrink-0 text-[12px] text-muted">
              Table name
            </label>
            <input
              id="url-table-name"
              value={tableName}
              onChange={(e) => {
                setNameEdited(true);
                setName(e.target.value);
              }}
              placeholder="derived from the file name"
              aria-label="Table name"
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem || replaces ? "url-table-name-note" : undefined}
              spellCheck={false}
              disabled={loading}
              className={`${input} h-7 max-w-[240px] font-mono text-[12px] ${problem ? "border-danger focus:border-danger focus:ring-danger-soft" : ""}`}
            />
            {(problem || replaces) && (
              <span id="url-table-name-note" className={`min-w-0 truncate text-[12px] ${problem ? "text-danger" : "text-warn"}`}>
                {problem ?? `Replaces the current table ${tableName.trim()}.`}
              </span>
            )}
          </div>
        )}
      </form>
      {error && <p className="mt-1.5 text-[12px] text-danger">{error}</p>}
    </div>
  );
}
