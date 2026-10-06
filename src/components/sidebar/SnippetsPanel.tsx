"use client";

import { useMemo, useRef, useState } from "react";
import { useSnippetStore, saveCurrentAsSnippet } from "@/stores/snippet-store";
import { toast } from "@/stores/ui-store";
import { insertSnippet, openSnippet } from "@/lib/workspace-actions";
import { copyText } from "@/lib/export/clipboard";
import { Icon } from "@/components/ui/icons";
import PanelHeader, { SearchBox } from "./PanelHeader";
import { btn, Menu, MOD } from "@/components/ui/primitives";
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
      <PanelHeader title="Snippets" count={snippets.length}>
        <button
          onClick={() => void saveCurrentAsSnippet()}
          className={btn.icon}
          title={`Save the query or selection (${MOD}+Shift+S)`}
          aria-label="Save query"
        >
          <Icon name="plus" size={15} />
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
      </PanelHeader>

      {snippets.length > 0 && (
        <SearchBox value={query} onChange={setQuery} placeholder="Search snippets" label="Search snippets" />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        {loaded && snippets.length === 0 && (
          <div className="flex flex-col items-center px-3 py-8 text-center">
            <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-raised text-muted">
              <Icon name="bookmark" size={18} />
            </span>
            <p className="mt-3 text-[14px] font-medium text-ink">No snippets yet</p>
            <p className="mt-1 text-[13px] leading-5 text-muted">
              Keep SQL you reuse here — joins, cleanups, report queries. Select some SQL (or use the whole
              tab) and press <span className="whitespace-nowrap">{MOD}+Shift+S</span>. Snippets are shared by every
              space and device.
            </p>
          </div>
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
                className="flex h-6 w-full items-center gap-1.5 px-3 text-left text-[11px] font-medium uppercase tracking-wide text-faint transition-colors hover:text-ink"
                aria-expanded={!isCollapsed}
              >
                <Icon name={isCollapsed ? "chevronRight" : "chevronDown"} size={12} />
                <span className="flex-1 truncate">{folder}</span>
                <span className="font-normal tabular-nums">{items.length}</span>
              </button>
              {!isCollapsed && (
                <ul>
                  {items.map((snippet) => (
                    <li key={snippet.id} className="group/s relative">
                      <button
                        onClick={() => insertSnippet(snippet.sql)}
                        className="w-full border-b border-line py-2 pl-3 pr-16 text-left transition-colors hover:bg-sunken"
                        title="Insert at the cursor"
                        aria-label={`Snippet ${snippet.name}`}
                      >
                        <span className="block truncate text-[13px] font-medium leading-5 text-ink">{snippet.name}</span>
                        {snippet.description && (
                          <span className="block truncate text-[11px] text-muted">{snippet.description}</span>
                        )}
                        <code className="mt-0.5 line-clamp-2 break-all font-mono text-[11px] leading-4 text-muted">{snippet.sql}</code>
                      </button>
                      <div className="absolute right-1.5 top-1.5 flex items-center rounded-md bg-surface opacity-0 ring-1 ring-line focus-within:opacity-100 group-hover/s:opacity-100">
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
                        <div className="mx-2 my-1.5 flex items-center gap-1.5 rounded-md bg-danger-soft px-2 py-1 text-[12px] text-danger">
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
