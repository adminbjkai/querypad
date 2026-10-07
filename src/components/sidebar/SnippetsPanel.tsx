"use client";

import { useMemo, useRef, useState } from "react";
import { useSnippetStore, saveCurrentAsSnippet } from "@/stores/snippet-store";
import { toast } from "@/stores/ui-store";
import { insertSnippet, openSnippet } from "@/lib/workspace-actions";
import { copyText } from "@/lib/export/clipboard";
import { Icon } from "@/components/ui/icons";
import PanelHeader, { SearchBox } from "./PanelHeader";
import { Dialog, HoverTray, Menu, MOD, SectionLabel, btn } from "@/components/ui/primitives";
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

  const [confirming, setConfirming] = useState<Snippet | null>(null);
  const remove = async (snippet: Snippet) => {
    setConfirming(null);
    await useSnippetStore.getState().remove(snippet.id).catch(() => toast("Couldn't delete the snippet.", "error"));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Snippets" count={snippets.length > 0 ? snippets.length : undefined}>
        <button
          onClick={() => void saveCurrentAsSnippet()}
          className={btn.icon}
          title={`Save the query or selection (${MOD}+Shift+S)`}
          aria-label="Save query"
        >
          <Icon name="plus" size={16} />
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
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <span className="flex size-9 items-center justify-center rounded-lg bg-raised text-muted">
              <Icon name="bookmark" size={18} />
            </span>
            <p className="mt-3 text-[14px] font-medium text-ink">No snippets yet</p>
            <p className="mt-1 text-[13px] leading-5 text-muted">
              Keep SQL you reuse here. Select some SQL (or use the whole tab) and press{" "}
              <span className="whitespace-nowrap">{MOD}+Shift+S</span>.
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
                className="flex h-7 w-full items-center gap-1 px-3 pt-1 text-left text-faint transition-colors hover:text-ink"
                aria-expanded={!isCollapsed}
              >
                <Icon name={isCollapsed ? "chevronRight" : "chevronDown"} size={12} />
                <SectionLabel as="div" count={items.length} className="min-w-0 [&>span:first-child]:truncate">
                  {folder}
                </SectionLabel>
              </button>
              {!isCollapsed && (
                <ul>
                  {items.map((snippet) => (
                    <li key={snippet.id} className="group relative">
                      <button
                        onClick={() => insertSnippet(snippet.sql)}
                        className="w-full border-b border-line py-2 pl-3 pr-24 text-left transition-colors hover:bg-sunken"
                        title="Insert at the cursor"
                        aria-label={`Snippet ${snippet.name}`}
                      >
                        <span className="block truncate text-[13px] font-medium leading-5 text-ink">{snippet.name}</span>
                        {snippet.description && (
                          <span className="block truncate text-[11px] text-muted">{snippet.description}</span>
                        )}
                        <code className="mt-0.5 block truncate font-mono text-[12px] leading-4 text-muted" title={snippet.sql}>
                          {snippet.sql}
                        </code>
                      </button>
                      <HoverTray className="top-1.5! translate-y-0!">
                        <button onClick={() => insertSnippet(snippet.sql)} className={btn.iconSm} title="Insert at the cursor" aria-label={`Insert ${snippet.name}`}>
                          <Icon name="insert" size={14} />
                        </button>
                        <button
                          onClick={() => openSnippet(snippet.sql, snippet.name, true)}
                          className={btn.iconSm}
                          title="Run in a new tab"
                          aria-label={`Run ${snippet.name}`}
                        >
                          <Icon name="play" size={14} />
                        </button>
                        <Menu
                          label={`Snippet ${snippet.name}`}
                          trigger={({ toggle: t }) => (
                            <button onClick={t} className={btn.iconSm} title="More" aria-label={`More for ${snippet.name}`}>
                              <Icon name="more" size={14} />
                            </button>
                          )}
                          items={[
                            { label: "Open in new tab", icon: "file", onSelect: () => openSnippet(snippet.sql, snippet.name) },
                            {
                              label: "Copy SQL",
                              icon: "copy",
                              onSelect: () => void copyText(snippet.sql).then(() => toast("Snippet copied.", "success")),
                            },
                            { label: "Edit", icon: "edit", onSelect: () => useSnippetStore.getState().openEditor(snippet) },
                            "divider",
                            { label: "Delete", icon: "trash", danger: true, onSelect: () => setConfirming(snippet) },
                          ]}
                        />
                      </HoverTray>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {confirming && (
        <Dialog
          title="Delete snippet"
          onClose={() => setConfirming(null)}
          width="max-w-sm"
          footer={
            <>
              <button onClick={() => setConfirming(null)} className={btn.secondary}>
                Cancel
              </button>
              <button onClick={() => void remove(confirming)} className={btn.danger} aria-label={`Confirm delete ${confirming.name}`}>
                Delete snippet
              </button>
            </>
          }
        >
          <p className="text-[14px] leading-5 text-ink">
            Delete “{confirming.name}”? It disappears from every space and device.
          </p>
        </Dialog>
      )}
    </div>
  );
}
