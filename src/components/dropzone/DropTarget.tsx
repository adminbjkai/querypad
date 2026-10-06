"use client";

import { useRef, useState } from "react";
import { ACCEPTED_EXTENSIONS, MAX_FILE_SIZE } from "@/lib/constants";
import { importAndReport } from "@/lib/import";
import { formatBytes } from "@/lib/utils";
import { Icon } from "@/components/ui/icons";
import { Spinner, btn } from "@/components/ui/primitives";

/** Click-or-drop area that imports files as tables. */
export default function DropTarget({ onAdded, tall, title = "Drop files here, or choose them" }: { onAdded?: () => void; tall?: boolean; title?: string }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const added = await importAndReport(Array.from(files));
      if (added.length > 0) onAdded?.();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        // preventDefault marks the drop as handled so the page-level handler skips it.
        e.preventDefault();
        setOver(false);
        void handle(e.dataTransfer.files);
      }}
      className={`flex w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 text-center transition-colors ${
        tall ? "min-h-[220px]" : "min-h-[180px]"
      } ${over ? "border-accent bg-accent-soft" : "border-line-strong bg-raised hover:bg-sunken/60"}`}
    >
      {busy ? (
        <>
          <Spinner className="size-6 text-accent" />
          <p className="text-[13px] text-muted">Reading files into DuckDB…</p>
        </>
      ) : (
        <>
          <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-surface text-muted">
            <Icon name="upload" size={20} />
          </span>
          <div>
            <p className="text-[14px] font-medium text-ink">{title}</p>
            <p className="mt-1 text-[13px] text-muted">
              CSV, TSV, Parquet, JSON, NDJSON or Excel, up to {formatBytes(MAX_FILE_SIZE)} each
            </p>
          </div>
          <button onClick={() => inputRef.current?.click()} className={btn.primary}>
            Choose files
          </button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={ACCEPTED_EXTENSIONS.join(",")}
            multiple
            onChange={(e) => void handle(e.target.files)}
            aria-label="Choose data files"
          />
        </>
      )}
    </div>
  );
}
