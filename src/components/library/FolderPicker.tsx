"use client";

import { useMemo, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { Select, input } from "@/components/ui/primitives";

export const NO_FOLDER = "";
export const NEW_FOLDER = "\u0000new";

/** A folder choice: an existing folder id, `NO_FOLDER`, or `NEW_FOLDER` with a typed name. */
export interface FolderChoice {
  value: string;
  newName: string;
}

/** Resolve a choice to a folder id, creating the typed folder when asked (a same-named folder is reused). */
export function resolveFolderChoice(choice: FolderChoice): string | null {
  const store = useWorkspaceStore.getState();
  if (choice.value === NEW_FOLDER) {
    const name = choice.newName.trim();
    if (!name) return null;
    const existing = store.folders.find((f) => f.name.toLowerCase() === name.toLowerCase());
    return (existing ?? store.createFolder(name)).id;
  }
  return choice.value === NO_FOLDER ? null : choice.value;
}

export function folderChoiceReady(choice: FolderChoice): boolean {
  return choice.value !== NEW_FOLDER || choice.newName.trim().length > 0;
}

export function useFolderChoice(initial: string | null = null) {
  return useState<FolderChoice>({ value: initial ?? NO_FOLDER, newName: "" });
}

/** "No folder" / each folder / "New folder…" (which reveals a name input). */
export default function FolderPicker({ choice, onChange, label = "Folder" }: { choice: FolderChoice; onChange: (choice: FolderChoice) => void; label?: string }) {
  const folders = useWorkspaceStore((s) => s.folders);
  const options = useMemo(
    () => [
      { value: NO_FOLDER, label: "No folder" },
      ...[...folders].sort((a, b) => a.name.localeCompare(b.name)).map((f) => ({ value: f.id, label: f.name })),
      { value: NEW_FOLDER, label: "New folder…" },
    ],
    [folders]
  );
  return (
    <div>
      <span className="mb-1 block text-[12px] text-muted">{label}</span>
      <Select value={choice.value} onChange={(value) => onChange({ ...choice, value })} options={options} ariaLabel={label} className="w-full [&>span]:flex-1 [&>span]:text-left" />
      {choice.value === NEW_FOLDER && (
        <input
          value={choice.newName}
          onChange={(e) => onChange({ ...choice, newName: e.target.value })}
          maxLength={120}
          placeholder="Folder name"
          className={`${input} mt-2`}
          aria-label="New folder name"
          autoFocus
        />
      )}
    </div>
  );
}
