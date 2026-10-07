"use client";

import { useRef, useState } from "react";
import { ACCEPTED_EXTENSIONS, MAX_FILE_SIZE, SUPPORTED_EXTENSIONS, WARN_FILE_SIZE } from "@/lib/constants";
import { formatBytes } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast } from "@/stores/ui-store";
import { Icon } from "@/components/ui/icons";
import { Chip, Dialog, Spinner, Tabs, btn, type ChipTone } from "@/components/ui/primitives";
import UrlInput from "./UrlInput";

type Mode = "files" | "url";

interface FileStatus {
  id: number;
  name: string;
  size: number;
  state: "queued" | "loading" | "done" | "error";
  message?: string;
}

const FORMAT_LABELS: Record<string, string> = {
  parquet: "Parquet",
  csv: "CSV",
  tsv: "TSV",
  json: "JSON",
  jsonl: "JSONL",
  ndjson: "NDJSON",
  xlsx: "Excel",
};
const FORMATS = SUPPORTED_EXTENSIONS.map((ext) => FORMAT_LABELS[ext] ?? ext.toUpperCase()).join(", ");

const STATE_LABEL: Record<FileStatus["state"], string> = { queued: "Queued", loading: "Loading…", done: "Added", error: "Failed" };
const STATE_TONE: Record<FileStatus["state"], ChipTone> = { queued: "neutral", loading: "accent", done: "ok", error: "danger" };

/** "Add data": a large drop zone with Browse, or a URL — and a per-file status list while importing. */
export default function AddFilesDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("files");
  const [over, setOver] = useState(false);
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const importFiles = useWorkspaceStore((s) => s.importFiles);

  const update = (id: number, patch: Partial<FileStatus>) =>
    setFiles((list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  // The store imports a batch with no progress callback, so each file is imported on its own:
  // the list shows queued → loading → done/error per file and the final outcome is summarized once.
  const handle = async (incoming: FileList | null) => {
    if (!incoming?.length || busy) return;
    const batch = Array.from(incoming);
    const base = Date.now();
    const statuses: FileStatus[] = batch.map((file, i) => ({ id: base + i, name: file.name, size: file.size, state: "queued" }));
    setFiles(statuses);
    setBusy(true);
    const added: string[] = [];
    let failed = 0;
    try {
      for (let i = 0; i < batch.length; i++) {
        const status = statuses[i];
        update(status.id, { state: "loading" });
        const summary = await importFiles([batch[i]]);
        for (const problem of summary.problems) if (problem.tone === "warning") toast(problem.message, "warning");
        if (summary.added.length > 0) {
          added.push(...summary.added);
          update(status.id, { state: "done", message: `table ${summary.added[0]}` });
        } else {
          failed++;
          const reason = summary.problems.find((p) => p.tone === "error")?.message ?? "Could not load this file.";
          update(status.id, { state: "error", message: reason.replace(`${status.name}: `, "") });
        }
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
    if (added.length === 1) toast(`Added table ${added[0]}.`, "success");
    else if (added.length > 1) toast(`Added ${added.length} tables: ${added.join(", ")}.`, "success");
    if (failed === 0 && added.length > 0) onClose();
  };

  const tabs: { id: Mode; label: string }[] = [
    { id: "files", label: "Files" },
    { id: "url", label: "From URL" },
  ];

  return (
    <Dialog
      title="Add data"
      onClose={onClose}
      width="max-w-xl"
      footerNote="Queries run in your browser. Loading a file with the same name replaces that table."
      footer={
        <button onClick={onClose} className={btn.secondary}>
          {files.length > 0 && !busy ? "Done" : "Cancel"}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <Tabs value={mode} onChange={(next) => setMode(next as Mode)} ariaLabel="Data source" tabs={tabs.map((t) => ({ value: t.id, label: t.label }))} />

        {mode === "files" ? (
          <div role="tabpanel" aria-label="Files" className="flex flex-col gap-3">
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
              className={`flex min-h-[264px] w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-6 text-center transition-colors ${
                over ? "border-accent bg-accent-soft" : "border-line-strong bg-raised"
              }`}
            >
              <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-surface text-muted">
                {busy ? <Spinner className="size-4 text-accent" /> : <Icon name="upload" size={20} />}
              </span>
              <p className="text-[14px] font-medium text-ink">{busy ? "Reading files into DuckDB…" : "Drag and drop files here"}</p>
              <div className="flex w-full max-w-[280px] items-center gap-3 text-[12px] text-faint" aria-hidden="true">
                <span className="h-px flex-1 bg-line" />
                or
                <span className="h-px flex-1 bg-line" />
              </div>
              <button onClick={() => inputRef.current?.click()} disabled={busy} className={btn.primary}>
                Browse
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
              <p className="mt-1 text-balance text-[12px] leading-5 text-muted">
                File size limit: {formatBytes(MAX_FILE_SIZE)} (over {formatBytes(WARN_FILE_SIZE)} runs slower)
                <br />
                Supported formats: {FORMATS}
              </p>
            </div>

            {files.length > 0 && (
              <ul className="divide-y divide-line rounded-lg border border-line" aria-label="Import progress">
                {files.map((file) => (
                  <li key={file.id} className="flex h-8 items-center gap-2.5 px-3 text-[13px]">
                    <Icon name="file" size={16} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-ink">{file.name}</span>
                      {file.message && (
                        <span className={`text-[12px] ${file.state === "error" ? "text-danger" : "text-muted"}`}> — {file.message}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[12px] tabular-nums text-faint">{formatBytes(file.size)}</span>
                    <span role="status" className="shrink-0">
                      <Chip tone={STATE_TONE[file.state]} className="gap-1">
                        {file.state === "loading" && <Spinner className="size-2.5" />}
                        {file.state === "done" && <Icon name="check" size={12} />}
                        {STATE_LABEL[file.state]}
                      </Chip>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div role="tabpanel" aria-label="From URL" className="flex flex-col gap-2">
            <p className="text-[13px] text-muted">Load a public file by URL. The server must allow cross-origin requests.</p>
            <UrlInput onAdded={onClose} />
          </div>
        )}

      </div>
    </Dialog>
  );
}
