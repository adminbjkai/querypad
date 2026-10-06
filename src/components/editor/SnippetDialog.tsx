"use client";

import { useMemo, useState } from "react";
import { MAX_SNIPPET_SQL, useSnippetStore, type SnippetDraft } from "@/stores/snippet-store";
import { useUiStore, toast } from "@/stores/ui-store";
import { Dialog, btn, input } from "@/components/ui/primitives";

/** Create or edit a snippet: name, folder, description and the SQL itself. */
export default function SnippetDialog({ draft }: { draft: SnippetDraft }) {
  const close = useSnippetStore((s) => s.closeEditor);
  const snippets = useSnippetStore((s) => s.snippets);
  const [name, setName] = useState(draft.name);
  const [folder, setFolder] = useState(draft.folder ?? "");
  const [description, setDescription] = useState(draft.description ?? "");
  const [sql, setSql] = useState(draft.sql);
  const [saving, setSaving] = useState(false);

  const folders = useMemo(
    () => [...new Set(snippets.map((s) => s.folder).filter((f): f is string => !!f))].sort(),
    [snippets]
  );

  const submit = async () => {
    if (!name.trim() || !sql.trim()) return;
    setSaving(true);
    try {
      await useSnippetStore.getState().save({ id: draft.id, name, folder, description, sql });
      toast(draft.id ? "Snippet updated." : "Snippet saved to your library.", "success");
      close();
      if (!draft.id) useUiStore.getState().showPanel("snippets");
    } catch (err) {
      toast(`Couldn't save the snippet: ${err instanceof Error ? err.message : err}`, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog title={draft.id ? "Edit snippet" : "Save snippet"} onClose={close} width="max-w-lg">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className={input} aria-label="Snippet name" required />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[12px] text-muted">Folder</span>
            <input
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              maxLength={100}
              list="qp-snippet-folders"
              placeholder="Unfiled"
              className={input}
              aria-label="Snippet folder"
            />
            <datalist id="qp-snippet-folders">
              {folders.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-muted">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              placeholder="Optional"
              className={input}
              aria-label="Snippet description"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">SQL</span>
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            rows={8}
            maxLength={MAX_SNIPPET_SQL}
            spellCheck={false}
            className={`${input} h-auto py-2 font-mono text-[12px] leading-[18px]`}
            aria-label="Snippet SQL"
            required
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={close} className={btn.secondary}>
            Cancel
          </button>
          <button type="submit" disabled={saving || !name.trim() || !sql.trim()} className={btn.primary}>
            {draft.id ? "Save changes" : "Save snippet"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
