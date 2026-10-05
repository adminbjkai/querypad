"use client";

import { useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { Dialog, Spinner, btn, input } from "@/components/ui/primitives";

/** Load ES-module plugins that add visualizations, exporters, or file loaders. */
export default function PluginManager({ onClose }: { onClose: () => void }) {
  const plugins = useWorkspaceStore((s) => s.plugins);
  const loadPlugin = useWorkspaceStore((s) => s.loadPlugin);
  const unloadPlugin = useWorkspaceStore((s) => s.unloadPlugin);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await loadPlugin(url.trim());
      setUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog title="Plugins" onClose={onClose}>
      <p className="mb-3 rounded-md bg-warn-soft px-2.5 py-2 text-[12px] leading-[18px] text-warn">
        A plugin runs with full access to this page and your data. Only load ones whose source you trust.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/plugin.js (ES module)" className={input} aria-label="Plugin URL" />
        <button type="submit" disabled={loading || !url.trim()} className={btn.primary}>
          {loading ? <Spinner className="size-3" /> : "Load"}
        </button>
      </form>
      {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}

      <ul className="mt-4 space-y-2">
        {plugins.length === 0 ? (
          <li className="py-3 text-center text-[13px] text-muted">No plugins loaded.</li>
        ) : (
          plugins.map((p) => (
            <li key={p.manifest.id} className="flex items-start gap-3 rounded-lg border border-line p-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink">
                  {p.manifest.name} <span className="text-[11px] font-normal text-faint">v{p.manifest.version}</span>
                </p>
                <p className="mt-0.5 text-[12px] text-muted">{p.manifest.description}</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {p.manifest.extensions.map((ext, i) => (
                    <span key={i} className="rounded bg-sunken px-1.5 py-0.5 text-[11px] text-muted">
                      {ext.type}
                    </span>
                  ))}
                </p>
              </div>
              <button onClick={() => unloadPlugin(p.manifest.id)} className={`${btn.ghost} hover:text-danger`}>
                Remove
              </button>
            </li>
          ))
        )}
      </ul>
    </Dialog>
  );
}
