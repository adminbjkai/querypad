"use client";

import { Dialog } from "@/components/ui/primitives";
import DropTarget from "./DropTarget";
import UrlInput from "./UrlInput";

export default function AddFilesDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Add data" onClose={onClose} width="max-w-lg">
      <div className="flex flex-col gap-4">
        <DropTarget onAdded={onClose} />
        <div>
          <p className="mb-1.5 text-[13px] text-muted">Or load from a URL</p>
          <UrlInput onAdded={onClose} />
        </div>
        <p className="text-[12px] leading-5 text-faint">
          Files never leave your browser. Tables are named after the file; loading a file with the same name replaces that table.
        </p>
      </div>
    </Dialog>
  );
}
