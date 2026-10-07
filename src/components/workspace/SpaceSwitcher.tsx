"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useWorkspaceStore, PLAYGROUND_NAME, type SpaceTemplate } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { Icon } from "@/components/ui/icons";
import { Dialog, Spinner, btn, input } from "@/components/ui/primitives";

function relative(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(at).toLocaleDateString();
}

const CREATE_OPTIONS: { template: SpaceTemplate; label: string; detail: string; icon: "copy" | "table" | "plus" }[] = [
  { template: "current", label: "Save as new space", detail: "Copy these tables, tabs and history", icon: "copy" },
  { template: "sample", label: "New space from sample data", detail: "The employees + departments template", icon: "table" },
  { template: "empty", label: "New empty space", detail: "Start from nothing", icon: "plus" },
];

const AVATAR_TONES = ["bg-accent-soft text-accent", "bg-join-soft text-join", "bg-ok-soft text-ok", "bg-warn-soft text-warn"];

/** A space's initial on a tone picked from its name, so each space is recognizable. */
function SpaceAvatar({ name }: { name: string }) {
  const tone = AVATAR_TONES[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_TONES.length];
  return (
    <span className={`flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ring-1 ring-line ${tone}`} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || "S"}
    </span>
  );
}

/** Navigation control for saved spaces: switch, create (copy / template / empty), rename, delete. */
export default function SpaceSwitcher({ compact = false }: { compact?: boolean }) {
  const spaces = useWorkspaceStore((s) => s.spaces);
  const spaceId = useWorkspaceStore((s) => s.spaceId);
  const switchSpace = useWorkspaceStore((s) => s.switchSpace);
  const createSpace = useWorkspaceStore((s) => s.createSpace);
  const renameSpace = useWorkspaceStore((s) => s.renameSpace);
  const deleteSpace = useWorkspaceStore((s) => s.deleteSpace);
  const toast = useUiStore((s) => s.toast);
  const open = useUiStore((s) => s.spaceMenuOpen);
  const setOpen = useUiStore((s) => s.setSpaceMenuOpen);

  const [naming, setNaming] = useState<SpaceTemplate | null>(null);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const current = spaces.find((s) => s.id === spaceId);
  const deleting = confirmDelete ? spaces.find((s) => s.id === confirmDelete) : undefined;
  const closeDelete = () => {
    setConfirmDelete(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("[data-space-action]")?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) {
      setNaming(null);
      setRenaming(null);
    }
  }, [open]);

  const run = async (task: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await task();
      toast(done, "success");
      setOpen(false);
    } catch (err) {
      toast(`That didn't work: ${err instanceof Error ? err.message : err}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const startNaming = (template: SpaceTemplate) => {
    setNaming(template);
    setName(template === "current" ? `${current?.name ?? "Space"} copy` : template === "sample" ? PLAYGROUND_NAME : "Untitled space");
  };

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={`flex h-8 items-center gap-2 rounded-md text-[13px] text-ink transition-colors hover:bg-sunken ${
          compact ? "w-9 justify-center" : "w-full px-1.5"
        } ${open ? "bg-sunken" : ""}`}
        aria-label={`Space: ${current?.name ?? "none"}. Switch or save spaces`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        title="Spaces: switch, save, or start fresh"
      >
        <SpaceAvatar name={current?.name ?? "Space"} />
        {!compact && (
          <>
            <span className="min-w-0 flex-1 truncate text-left font-medium">{current?.name ?? "Space"}</span>
            <Icon name="chevronDown" size={14} className="text-faint" />
          </>
        )}
      </button>

      {open && (
        <div id={panelId} className="qp-pop absolute left-0 top-full z-50 mt-1 max-h-[min(75vh,36rem)] w-[320px] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-lg border border-line bg-surface p-1.5 shadow-pop" role="dialog" aria-label="Spaces">
          <p className="px-2 pb-1 pt-1 text-[12px] text-muted">Your spaces — saved for every device</p>
          <ul className="max-h-[40vh] overflow-y-auto">
            {spaces.map((space) => {
              const active = space.id === spaceId;
              return (
                <li key={space.id} className="group/space flex items-center gap-1 rounded-md hover:bg-raised">
                  {renaming === space.id ? (
                    <form
                      className="flex flex-1 gap-1 p-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void renameSpace(space.id, name).then(() => setRenaming(null));
                      }}
                    >
                      <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} h-7`} autoFocus aria-label="Space name" />
                      <button type="submit" className={`${btn.primary} h-7`}>
                        Save
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        data-space-action
                        disabled={busy}
                        onClick={() => (active ? setOpen(false) : void run(() => switchSpace(space.id), `Opened ${space.name}.`))}
                        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                        aria-current={active}
                      >
                        <Icon name={active ? "check" : "table"} size={14} className={active ? "text-accent" : "text-faint"} />
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-[13px] ${active ? "font-medium text-ink" : "text-ink"}`}>{space.name}</span>
                          <span className="block text-[11px] text-faint">
                            {space.tableCount} {space.tableCount === 1 ? "table" : "tables"}, saved {relative(space.updatedAt)}
                          </span>
                        </span>
                      </button>
                      <div className="flex shrink-0 pr-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/space:opacity-100">
                        <button
                          onClick={() => {
                            setRenaming(space.id);
                            setName(space.name);
                          }}
                          className="rounded p-1 text-muted hover:bg-sunken hover:text-ink"
                          aria-label={`Rename ${space.name}`}
                          title="Rename"
                        >
                          <Icon name="file" size={14} />
                        </button>
                        <button
                          onClick={() => {
                            setOpen(false);
                            setConfirmDelete(space.id);
                          }}
                          className="rounded p-1 text-muted hover:bg-danger-soft hover:text-danger"
                          aria-label={`Delete ${space.name}`}
                          title="Delete"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-1 border-t border-line pt-1">
            {naming ? (
              <form
                className="space-y-2 p-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const template = naming;
                  void run(() => createSpace(name, template), template === "current" ? `Saved as ${name.trim()}.` : `Created ${name.trim()}.`);
                }}
              >
                <label className="block text-[12px] text-muted">
                  {CREATE_OPTIONS.find((o) => o.template === naming)?.label}
                  <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} mt-1`} autoFocus aria-label="New space name" />
                </label>
                <div className="flex gap-1.5">
                  <button type="submit" disabled={busy || !name.trim()} className={btn.primary}>
                    {busy && <Spinner className="size-3" />}
                    Create
                  </button>
                  <button type="button" onClick={() => setNaming(null)} className={btn.ghost}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              CREATE_OPTIONS.map((option) => (
                <button
                  key={option.template}
                  onClick={() => startNaming(option.template)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-raised"
                >
                  <Icon name={option.icon} size={14} className="text-muted" />
                  <span>
                    <span className="block text-[13px] text-ink">{option.label}</span>
                    <span className="block text-[11px] text-faint">{option.detail}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {deleting && (
        <Dialog
          title={`Delete ${deleting.name}?`}
          onClose={closeDelete}
          width="max-w-sm"
          footer={
            <>
              <button onClick={closeDelete} className={btn.secondary}>
                Cancel
              </button>
              <button
                onClick={() => void run(() => deleteSpace(deleting.id), `Deleted ${deleting.name}.`).then(closeDelete)}
                disabled={busy}
                className={btn.danger}
                aria-label={`Confirm delete ${deleting.name}`}
              >
                {busy && <Spinner className="size-3" />}
                Delete space
              </button>
            </>
          }
        >
          <p className="text-[13px] leading-5 text-muted">
            This deletes the space and its {deleting.tableCount} {deleting.tableCount === 1 ? "dataset" : "datasets"}, tabs and history on every device. Saved snippets and your
            other spaces stay.
          </p>
        </Dialog>
      )}
    </div>
  );
}
