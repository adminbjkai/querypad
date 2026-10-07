"use client";

import { useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { Dialog, Spinner, btn } from "@/components/ui/primitives";

/** Confirms removing the open space's tables, tabs and history (the space itself stays). */
export default function ClearSpaceDialog({ onClose }: { onClose: () => void }) {
  const name = useWorkspaceStore((s) => s.spaces.find((sp) => sp.id === s.spaceId)?.name ?? "this space");
  const tableCount = useWorkspaceStore((s) => s.tables.length + s.views.length);
  const [busy, setBusy] = useState(false);

  const clear = async () => {
    setBusy(true);
    try {
      await useWorkspaceStore.getState().clearWorkspace();
      useUiStore.getState().toast("Space cleared.");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Clear this space?"
      onClose={onClose}
      width="max-w-sm"
      footer={
        <>
          <button onClick={onClose} className={btn.secondary}>
            Cancel
          </button>
          <button onClick={() => void clear()} disabled={busy} className={btn.danger}>
            {busy && <Spinner className="size-3" />}
            Clear space
          </button>
        </>
      }
    >
      <p className="text-[13px] leading-5 text-muted">
        This removes the {tableCount} {tableCount === 1 ? "dataset" : "datasets"}, tabs and history in{" "}
        <span className="font-medium text-ink">{name}</span> on every device. Saved snippets and your other spaces stay.
      </p>
    </Dialog>
  );
}
