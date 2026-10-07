"use client";

import { useId, useState } from "react";
import { create } from "zustand";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast } from "@/stores/ui-store";
import { defaultSnippetName } from "@/stores/snippet-store";
import { Dialog, btn, input } from "@/components/ui/primitives";
import FolderPicker, { folderChoiceReady, resolveFolderChoice, useFolderChoice } from "./FolderPicker";

interface SaveQueryDialogState {
  tabId: string | null;
  open: (tabId: string) => void;
  close: () => void;
}

/** Which tab the "Save query" dialog is naming (null = closed). Opened from the tab bar, ⌘S and menus. */
export const useSaveQueryDialog = create<SaveQueryDialogState>((set) => ({
  tabId: null,
  open: (tabId) => set({ tabId }),
  close: () => set({ tabId: null }),
}));

export const openSaveQueryDialog = (tabId: string) => useSaveQueryDialog.getState().open(tabId);

/** A readable default: the tab's own title, or "<table> query" from its SQL. */
function defaultName(title: string, sql: string): string {
  if (title && !/^Query \d+$/.test(title)) return title;
  const derived = defaultSnippetName(sql);
  return derived === "Untitled snippet" ? "Untitled query" : derived;
}

function SaveQueryForm({ tabId, onClose }: { tabId: string; onClose: () => void }) {
  const tab = useWorkspaceStore((s) => s.tabs.find((t) => t.id === tabId));
  const [name, setName] = useState(() => defaultName(tab?.title ?? "", tab?.query ?? ""));
  const [choice, setChoice] = useFolderChoice(null);
  const formId = useId();

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || !folderChoiceReady(choice)) return;
    useWorkspaceStore.getState().saveQuery(tabId, trimmed, resolveFolderChoice(choice));
    toast("Saved.", "success");
    onClose();
  };

  return (
    <Dialog
      title="Save query"
      onClose={onClose}
      width="max-w-sm"
      footer={
        <>
          <button type="button" onClick={onClose} className={btn.secondary}>
            Cancel
          </button>
          <button type="submit" form={formId} disabled={!name.trim() || !folderChoiceReady(choice)} className={btn.primary}>
            Save
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="Untitled query"
            className={input}
            aria-label="Query name"
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            required
          />
        </label>
        <FolderPicker choice={choice} onChange={setChoice} />
      </form>
    </Dialog>
  );
}

/** Mounted once (by the tab bar); renders the dialog while a tab is being saved for the first time. */
export default function SaveQueryDialog() {
  const tabId = useSaveQueryDialog((s) => s.tabId);
  const close = useSaveQueryDialog((s) => s.close);
  if (!tabId) return null;
  return <SaveQueryForm key={tabId} tabId={tabId} onClose={close} />;
}
