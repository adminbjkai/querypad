"use client";

import { useState } from "react";
import { loadRemoteFileAsTable } from "@/lib/duckdb/remote";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast } from "@/stores/ui-store";
import { Spinner, btn, input } from "@/components/ui/primitives";

/** Load a file from a public URL (the server must allow cross-origin requests). */
export default function UrlInput({ onAdded }: { onAdded?: () => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addTable = useWorkspaceStore((s) => s.addTable);

  const load = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const { table, fileName, data } = await loadRemoteFileAsTable(trimmed);
      addTable(table, fileName, data);
      toast(`Added table ${table.name}.`, "success");
      setUrl("");
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
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/data.parquet"
          className={input}
          disabled={loading}
          aria-label="File URL"
        />
        <button type="submit" disabled={loading || !url.trim()} className={btn.secondary}>
          {loading ? <Spinner /> : "Load"}
        </button>
      </form>
      {error && <p className="mt-1.5 text-[12px] text-danger">{error}</p>}
    </div>
  );
}
