"use client";

import { useId } from "react";
import { Dialog, btn } from "@/components/ui/primitives";
import FolderPicker, { folderChoiceReady, resolveFolderChoice, useFolderChoice } from "./FolderPicker";

/** Pick a folder (or none, or a new one) for a saved query or notebook. */
export default function MoveToFolderDialog({
  name,
  current,
  onMove,
  onClose,
}: {
  name: string;
  current: string | null;
  onMove: (folderId: string | null) => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = useFolderChoice(current);
  const formId = useId();
  const submit = () => {
    if (!folderChoiceReady(choice)) return;
    onMove(resolveFolderChoice(choice));
    onClose();
  };
  return (
    <Dialog
      title={`Move “${name}”`}
      onClose={onClose}
      width="max-w-sm"
      footer={
        <>
          <button type="button" onClick={onClose} className={btn.secondary}>
            Cancel
          </button>
          <button type="submit" form={formId} disabled={!folderChoiceReady(choice)} className={btn.primary}>
            Move
          </button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <FolderPicker choice={choice} onChange={setChoice} label="Move to" />
      </form>
    </Dialog>
  );
}
