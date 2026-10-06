"use client";

import { useMemo, useRef, useState } from "react";
import { useSnippetStore, saveCurrentAsSnippet } from "@/stores/snippet-store";
import { toast } from "@/stores/ui-store";
import { insertSnippet, openSnippet } from "@/lib/workspace-actions";
import { copyText } from "@/lib/export/clipboard";
import { Icon } from "@/components/ui/icons";
import { btn, input, Menu, MOD } from "@/components/ui/primitives";
import type { Snippet } from "@/types/snippet";

const UNFILED = "Unfiled";

/** Every query word must appear in the snippet's name, folder, description or SQL. */
function matches(snippet: Snippet, query: string): boolean {
  const haystack = `${snippet.name} ${snippet.folder ?? ""} ${snippet.description ?? ""} ${snippet.sql}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export default function SnippetsPanel() {
  const snippets = useSnippetStore((s) => s.snippets);
  const loaded = useSnippetStore((s) => s.loaded);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => {
    const map = new Map<string, Snippet[]>();
    for (const snippet of snippets) {
      if (query.trim() && !matches(snippet, query)) continue;
      const folder = snippet.folder ?? UNFILED;
      map.set(folder, [...(map.get(folder) ?? []), snippet]);
    }
    // Named folders alphabetically, unfiled snippets last.
    return [...map.entries()].sort(([a], [b]) => (a === UNFILED ? 1 : b === UNFILED ? -1 : a.localeCompare(b)));
  }, [snippets, query]);

  const toggle = (folder: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });

  const exportAll = () => {
    const blob = new Blob([useSnippetStore.getState().exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "querypad-snippets.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const count = await useSnippetStore.getState().importJson(await file.text());
      toast(count > 0 ? `Imported ${count} snippet${count === 1 ? "" : "s"}.` : "No snippets found in that file.", count > 0 ? "success" : "warning");
    } catch (err) {
      toast(`Couldn't import snippets: ${err instanceof Error ? err.message : err}`, "error");
    }
  };

  const [confirming, setConfirming] = useState<string | null>(null);
  const remove = async (snippet: Snippet) => {
    setConfirming(null);
    await useSnippetStore.getState().remove(snippet.id).catch(() => toast("Couldn't delete the snippet.", "error"));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-1 px-3 pb-1 pt-2.5">
        <p className="text-[12px] text-muted">
          {snippets.length} {snippets.length === 1 ? "snippet" : "snippets"}
        </p>
        <div className="flex items-center">
          <button onClick={() => void saveCurrentAsSnippet()} className={btn.ghost} title={`Save the query or selection (${MOD}+Shift+S)`}>
            <Icon name="plus" size={14} />
            Save query
          </button>
          <Menu
            label="Snippet library"
            trigger={({ toggle }) => (
              <button onClick={toggle} className={btn.icon} aria-label="Snippet library options">
                <Icon name="more" />
              </button>
            )}
            items={[
              { label: "New empty snippet", icon: "plus", onSelect: () => useSnippetStore.getState().openEditor({ name: "", sql: "" }) },
              { label: "Export all (JSON)", icon: "download", disabled: snippets.length === 0, onSelect: exportAll },
              { label: "Import from JSON…", icon: "upload", onSelect: () => fileRef.current?.click() },
            ]}
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Import snippets file"
            onChange={(e) => {
              void importFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {snippets.length > 0 && (
        <div className="px-3 pb-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search snippets"
            aria-label="Search snippets"
            className={input}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {loaded && snippets.length === 0 && (
          <p className="px-2.5 py-6 text-center text-[13px] leading-5 text-muted">
            Keep SQL you reuse here — joins, cleanups, report queries. Select some SQL (or use the whole
            tab) and press <span className="whitespace-nowrap">{MOD}+Shift+S</span>. Snippets are shared by every
            space and device.
          </p>
        )}
        {snippets.length > 0 && groups.length === 0 && (
          <p className="px-2.5 py-6 text-center text-[13px] text-muted">No snippet matches “{query}”.</p>
        )}
        {groups.map(([folder, items]) => {
          const isCollapsed = collapsed.has(folder) && !query.trim();
          return (
            <section key={folder} aria-label={`Folder ${folder}`}>
              <button
                onClick={() => toggle(folder)}
                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12px] font-medium text-muted hover:text-ink"
                aria-expanded={!isCollapsed}
              >
                <Icon name={isCollapsed ? "chevronRight" : "chevronDown"} size={13} />
                <Icon name="folder" size={13} />
                <span className="flex-1 truncate">{folder}</span>
                <span className="text-[11px] text-faint">{items.length}</span>
              </button>
              {!isCollapsed && (
                <ul>
                  {items.map((snippet) => (
                    <li key={snippet.id} className="group/s relative">
                      <button
                        onClick={() => insertSnippet(snippet.sql)}
                        className="w-full rounded-md py-1.5 pl-6 pr-16 text-left hover:bg-raised"
                        title="Insert at the cursor"
                        aria-label={`Snippet ${snippet.name}`}
                      >
                        <span className="block truncate text-[13px] text-ink">{snippet.name}</span>
                        {snippet.description && (
                          <span className="block truncate text-[11px] text-muted">{snippet.description}</span>
                        )}
                        <code className="mt-0.5 line-clamp-2 break-all font-mono text-[11px] leading-4 text-faint">{snippet.sql}</code>
                      </button>
                      <div className="absolute right-1 top-1 flex items-center opacity-0 focus-within:opacity-100 group-hover/s:opacity-100">
                        <button
                          onClick={() => openSnippet(snippet.sql, snippet.name, true)}
                          className={btn.icon}
                          title="Run in a new tab"
                          aria-label={`Run ${snippet.name}`}
                        >
                          <Icon name="play" size={13} />
                        </button>
                        <Menu
                          label={`Snippet ${snippet.name}`}
                          trigger={({ toggle: t }) => (
                            <button onClick={t} className={btn.icon} aria-label={`More for ${snippet.name}`}>
                              <Icon name="more" />
                            </button>
                          )}
                          items={[
                            { label: "Insert at cursor", icon: "insert", onSelect: () => insertSnippet(snippet.sql) },
                            { label: "Open in new tab", icon: "file", onSelect: () => openSnippet(snippet.sql, snippet.name) },
                            {
                              label: "Copy SQL",
                              icon: "copy",
                              onSelect: () => void copyText(snippet.sql).then(() => toast("Snippet copied.", "success")),
                            },
                            { label: "Edit", icon: "edit", onSelect: () => useSnippetStore.getState().openEditor(snippet) },
                            "divider",
                            { label: "Delete", icon: "trash", danger: true, onSelect: () => setConfirming(snippet.id) },
                          ]}
                        />
                      </div>
                      {confirming === snippet.id && (
                        <div className="mx-1 mb-1 flex items-center gap-1.5 rounded-md bg-danger-soft px-2 py-1.5 text-[12px] text-danger">
                          <span className="flex-1">Delete this snippet?</span>
                          <button onClick={() => void remove(snippet)} className={`${btn.ghost} h-6 text-danger`} aria-label={`Confirm delete ${snippet.name}`}>
                            Delete
                          </button>
                          <button onClick={() => setConfirming(null)} className={`${btn.ghost} h-6`}>
                            Cancel
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
