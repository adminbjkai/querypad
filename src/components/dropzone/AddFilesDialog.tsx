"use client";

import { useMemo, useRef, useState } from "react";
import { ACCEPTED_EXTENSIONS, MAX_FILE_SIZE, SUPPORTED_EXTENSIONS, WARN_FILE_SIZE } from "@/lib/constants";
import { formatBytes, sanitizeTableName } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast } from "@/stores/ui-store";
import { Icon } from "@/components/ui/icons";
import { Chip, Dialog, Spinner, Tabs, btn, input, type ChipTone } from "@/components/ui/primitives";
import UrlInput from "./UrlInput";
import { tableNameProblem } from "./table-name";

type Mode = "files" | "url";

interface FileStatus {
  id: number;
  file: File;
  /** Editable table name, prefilled from the file name. */
  tableName: string;
  state: "staged" | "queued" | "loading" | "done" | "error";
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

const STATE_LABEL: Record<FileStatus["state"], string> = { staged: "Ready", queued: "Queued", loading: "Loading…", done: "Added", error: "Failed" };
const STATE_TONE: Record<FileStatus["state"], ChipTone> = { staged: "neutral", queued: "neutral", loading: "accent", done: "ok", error: "danger" };

/** "Add data": a large drop zone with Browse, or a URL — each file gets an editable table name before it loads. */
export default function AddFilesDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("files");
  const [over, setOver] = useState(false);
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const importFiles = useWorkspaceStore((s) => s.importFiles);
  const existing = useWorkspaceStore((s) => s.tables);
  const existingNames = useMemo(() => new Set(existing.map((t) => t.name.toLowerCase())), [existing]);

  const update = (id: number, patch: Partial<FileStatus>) =>
    setFiles((list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const staged = files.filter((f) => f.state === "staged");
  const problems = useMemo(() => {
    const map = new Map<number, string | null>();
    const taken: string[] = [];
    for (const f of files) {
      if (f.state !== "staged") continue;
      map.set(f.id, tableNameProblem(f.tableName, taken));
      taken.push(f.tableName.trim());
    }
    return map;
  }, [files]);
  const canLoad = staged.length > 0 && !busy && staged.every((f) => !problems.get(f.id));

  // Picking files only stages them (with a derived, editable table name); "Load" imports the batch.
  const stage = (incoming: FileList | null) => {
    if (!incoming?.length || busy) return;
    const base = Date.now();
    const taken = files.map((f) => f.tableName.trim().toLowerCase());
    const next: FileStatus[] = Array.from(incoming).map((file, i) => {
      let name = sanitizeTableName(file.name);
      for (let n = 2; taken.includes(name.toLowerCase()); n++) name = `${sanitizeTableName(file.name)}_${n}`;
      taken.push(name.toLowerCase());
      return { id: base + i, file, tableName: name, state: "staged" };
    });
    setFiles((list) => [...list.filter((f) => f.state !== "done"), ...next]);
    if (inputRef.current) inputRef.current.value = "";
  };

  // The store imports a batch with no progress callback, so each file is imported on its own:
  // the list shows queued → loading → done/error per file and the final outcome is summarized once.
  const load = async () => {
    if (!canLoad) return;
    const batch = staged.map((f) => ({ ...f, tableName: f.tableName.trim() }));
    setBusy(true);
    for (const f of batch) update(f.id, { state: "queued", tableName: f.tableName });
    const added: string[] = [];
    let failed = 0;
    try {
      for (const status of batch) {
        update(status.id, { state: "loading" });
        const summary = await importFiles([status.file], { names: { [status.file.name]: status.tableName } });
        for (const problem of summary.problems) if (problem.tone === "warning") toast(problem.message, "warning");
        if (summary.added.length > 0) {
          added.push(...summary.added);
          update(status.id, { state: "done", message: `table ${summary.added[0]}` });
        } else {
          failed++;
          const reason = summary.problems.find((p) => p.tone === "error")?.message ?? "Could not load this file.";
          update(status.id, { state: "error", message: reason.replace(`${status.file.name}: `, "") });
        }
      }
    } finally {
      setBusy(false);
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
        <>
          <button onClick={onClose} className={btn.secondary}>
            {files.length > 0 && !busy && staged.length === 0 ? "Done" : "Cancel"}
          </button>
          {mode === "files" && staged.length > 0 && (
            <button onClick={() => void load()} disabled={!canLoad} className={btn.primary}>
              {busy && <Spinner />}
              Load {staged.length} {staged.length === 1 ? "file" : "files"}
            </button>
          )}
        </>
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
                stage(e.dataTransfer.files);
              }}
              className={`flex w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-6 text-center transition-colors ${
                files.length > 0 ? "min-h-[160px]" : "min-h-[264px]"
              } ${over ? "border-accent bg-accent-soft" : "border-line-strong bg-raised"}`}
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
              <button onClick={() => inputRef.current?.click()} disabled={busy} className={files.length > 0 ? btn.secondary : btn.primary}>
                Browse
              </button>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept={ACCEPTED_EXTENSIONS.join(",")}
                multiple
                onChange={(e) => stage(e.target.files)}
                aria-label="Choose data files"
              />
              <p className="mt-1 text-balance text-[12px] leading-5 text-muted">
                File size limit: {formatBytes(MAX_FILE_SIZE)} (over {formatBytes(WARN_FILE_SIZE)} runs slower)
                <br />
                Supported formats: {FORMATS}
              </p>
            </div>

            {files.length > 0 && (
              <ul className="divide-y divide-line rounded-lg border border-line" aria-label="Files to load">
                {files.map((file) => {
                  const problem = problems.get(file.id) ?? null;
                  const replaces = file.state === "staged" && !problem && existingNames.has(file.tableName.trim().toLowerCase());
                  const errorId = `name-error-${file.id}`;
                  return (
                    <li key={file.id} className="flex flex-col gap-1 px-3 py-1.5 text-[13px]">
                      <div className="flex min-h-7 items-center gap-2.5">
                        <Icon name="file" size={16} className="shrink-0 text-muted" />
                        <span className="min-w-0 flex-1 truncate">
                          <span className="text-ink">{file.file.name}</span>
                          {file.message && (
                            <span className={`text-[12px] ${file.state === "error" ? "text-danger" : "text-muted"}`}> — {file.message}</span>
                          )}
                        </span>
                        <span className="shrink-0 text-[12px] tabular-nums text-faint">{formatBytes(file.file.size)}</span>
                        <span role="status" className="shrink-0">
                          <Chip tone={STATE_TONE[file.state]} className="gap-1">
                            {file.state === "loading" && <Spinner className="size-2.5" />}
                            {file.state === "done" && <Icon name="check" size={12} />}
                            {STATE_LABEL[file.state]}
                          </Chip>
                        </span>
                        {file.state === "staged" && (
                          <button
                            onClick={() => setFiles((list) => list.filter((f) => f.id !== file.id))}
                            className={btn.iconSm}
                            aria-label={`Remove ${file.file.name}`}
                            title="Remove from this batch"
                          >
                            <Icon name="x" size={14} />
                          </button>
                        )}
                      </div>
                      {file.state === "staged" ? (
                        <div className="flex items-center gap-2 pl-[26px]">
                          <label htmlFor={`name-${file.id}`} className="shrink-0 text-[12px] text-muted">
                            Table name
                          </label>
                          <input
                            id={`name-${file.id}`}
                            value={file.tableName}
                            onChange={(e) => update(file.id, { tableName: e.target.value })}
                            onKeyDown={(e) => e.key === "Enter" && void load()}
                            aria-label={`Table name for ${file.file.name}`}
                            aria-invalid={problem ? true : undefined}
                            aria-describedby={problem || replaces ? errorId : undefined}
                            spellCheck={false}
                            className={`${input} h-7 max-w-[240px] font-mono text-[12px] ${problem ? "border-danger focus:border-danger focus:ring-danger-soft" : ""}`}
                          />
                          {(problem || replaces) && (
                            <span id={errorId} className={`min-w-0 truncate text-[12px] ${problem ? "text-danger" : "text-warn"}`}>
                              {problem ?? `Replaces the current table ${file.tableName.trim()}.`}
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="pl-[26px] text-[12px] text-muted">
                          Table name <span className="font-mono text-ink">{file.tableName}</span>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <div role="tabpanel" aria-label="From URL" className="flex flex-col gap-2">
            <p className="text-[13px] text-muted">Load a public file by URL. The server must allow cross-origin requests.</p>
            <UrlInput onAdded={onClose} withName />
          </div>
        )}

      </div>
    </Dialog>
  );
}
