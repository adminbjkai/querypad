"use client";

import { useId, useMemo, useState } from "react";
import { MAX_SNIPPET_SQL, useSnippetStore, type SnippetDraft } from "@/stores/snippet-store";
import { useUiStore, toast } from "@/stores/ui-store";
import { Dialog, Select, btn, input } from "@/components/ui/primitives";
import { NEW_FOLDER } from "@/components/library/FolderPicker";

const UNFILED = "";

/** Create or edit a snippet: name, folder, description and the SQL itself. */
export default function SnippetDialog({ draft }: { draft: SnippetDraft }) {
  const close = useSnippetStore((s) => s.closeEditor);
  const snippets = useSnippetStore((s) => s.snippets);
  const [name, setName] = useState(draft.name);
  const [description, setDescription] = useState(draft.description ?? "");
  const [sql, setSql] = useState(draft.sql);
  const [saving, setSaving] = useState(false);
  const formId = useId();
  // The SQL saved from the editor is shown as a read-only preview; edits and blank snippets type it in.
  const sqlLocked = !draft.id && draft.sql.trim().length > 0;

  const folders = useMemo(() => {
    const seen = new Map<string, string>();
    for (const f of [draft.folder, ...snippets.map((s) => s.folder)]) {
      if (f && !seen.has(f.toLowerCase())) seen.set(f.toLowerCase(), f);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [snippets, draft.folder]);

  const [folderChoice, setFolderChoice] = useState<string>(draft.folder ?? UNFILED);
  const [newFolder, setNewFolder] = useState("");
  const folderOptions = useMemo(
    () => [
      { value: UNFILED, label: "Unfiled" },
      ...folders.map((f) => ({ value: f, label: f })),
      { value: NEW_FOLDER, label: "New folder…" },
    ],
    [folders]
  );

  /** The folder to save: a typed name joins an existing folder when only the casing differs. */
  const folder = useMemo(() => {
    if (folderChoice !== NEW_FOLDER) return folderChoice;
    const typed = newFolder.trim();
    return folders.find((f) => f.toLowerCase() === typed.toLowerCase()) ?? typed;
  }, [folderChoice, newFolder, folders]);

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
    <Dialog
      title={draft.id ? "Edit snippet" : "Save snippet"}
      onClose={close}
      width="max-w-lg"
      footerNote={sqlLocked ? "Saved from the editor; edit the SQL later from the snippet's menu." : undefined}
      footer={
        <>
          <button type="button" onClick={close} className={btn.secondary}>
            Cancel
          </button>
          <button type="submit" form={formId} disabled={saving || !name.trim() || !sql.trim()} className={btn.primary}>
            {draft.id ? "Save changes" : "Save snippet"}
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder="Untitled snippet"
            className={input}
            aria-label="Snippet name"
            autoFocus
            required
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="mb-1 block text-[12px] text-muted">Folder</span>
            <Select
              value={folderChoice}
              onChange={setFolderChoice}
              options={folderOptions}
              ariaLabel="Snippet folder"
              className="w-full [&>span]:flex-1 [&>span]:text-left"
            />
            {folderChoice === NEW_FOLDER && (
              <input
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                maxLength={100}
                placeholder="Folder name"
                className={`${input} mt-2`}
                aria-label="New folder name"
                autoFocus
              />
            )}
          </div>
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
            readOnly={sqlLocked}
            rows={8}
            maxLength={MAX_SNIPPET_SQL}
            spellCheck={false}
            className={`${input} h-auto py-2 font-mono text-[12px] leading-[18px] ${sqlLocked ? "bg-raised text-muted focus:ring-0" : ""}`}
            aria-label="Snippet SQL"
            required
          />
        </label>
      </form>
    </Dialog>
  );
}
