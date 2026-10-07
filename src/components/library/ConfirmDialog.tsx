"use client";

import type { ReactNode } from "react";
import { Dialog, btn } from "@/components/ui/primitives";

/** Small confirmation for a destructive library action (DESIGN.md: a dialog, never a toast race). */
export default function ConfirmDialog({
  title,
  action,
  children,
  onConfirm,
  onClose,
}: {
  title: string;
  action: string;
  children: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      width="max-w-sm"
      footer={
        <>
          <button type="button" onClick={onClose} className={btn.secondary}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={btn.danger}
          >
            {action}
          </button>
        </>
      }
    >
      <p className="text-[13px] leading-5 text-muted">{children}</p>
    </Dialog>
  );
}
