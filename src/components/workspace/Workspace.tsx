"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { getDB } from "@/lib/duckdb/instance";
import { SAMPLE_TABLE_NAMES } from "@/lib/constants";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useSnippetStore, saveCurrentAsSnippet } from "@/stores/snippet-store";
import { useUiStore } from "@/stores/ui-store";
import { importAndReport } from "@/lib/import";
import { runActive } from "@/lib/workspace-actions";
import Header from "./Header";
import EmptyState from "./EmptyState";
import Splash from "./Splash";
import Sidebar from "@/components/sidebar/Sidebar";
import SqlWorkbench from "@/components/editor/SqlWorkbench";
import Toaster from "@/components/ui/Toaster";
import { Icon } from "@/components/ui/icons";

const PipelineView = dynamic(() => import("@/components/pipeline/PipelineView"), { ssr: false });
const CommandPalette = dynamic(() => import("./CommandPalette"), { ssr: false });
const AddFilesDialog = dynamic(() => import("@/components/dropzone/AddFilesDialog"), { ssr: false });
const CollaborateDialog = dynamic(() => import("@/components/collaboration/CollaborateDialog"), { ssr: false });
const PluginManager = dynamic(() => import("@/components/plugins/PluginManager"), { ssr: false });
const ShortcutsDialog = dynamic(() => import("./ShortcutsDialog"), { ssr: false });
const SnippetDialog = dynamic(() => import("@/components/editor/SnippetDialog"), { ssr: false });

const WELCOME_KEY = "querypad:welcome-dismissed";

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.closest(".monaco-editor"));
}

export default function Workspace() {
  const dbReady = useWorkspaceStore((s) => s.dbReady);
  const setDbReady = useWorkspaceStore((s) => s.setDbReady);
  const hydrated = useWorkspaceStore((s) => s._hydrated);
  const init = useWorkspaceStore((s) => s.init);
  const everHydrated = useRef(false);
  if (hydrated) everHydrated.current = true;
  const tables = useWorkspaceStore((s) => s.tables);
  const viewMode = useWorkspaceStore((s) => s.viewMode);

  const dialog = useUiStore((s) => s.dialog);
  const setDialog = useUiStore((s) => s.setDialog);
  const paletteOpen = useUiStore((s) => s.paletteOpen);
  const snippetDraft = useSnippetStore((s) => s.draft);

  const isSharedPage = usePathname() === "/shared";
  const [dbError, setDbError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(WELCOME_KEY) === "1"
  );
  const initStarted = useRef(false);
  const roomJoinAttempted = useRef(false);
  const dragDepth = useRef(0);

  const onlySampleTables = tables.length > 0 && tables.every((t) => SAMPLE_TABLE_NAMES.has(t.name));

  useEffect(() => {
    getDB()
      .then(() => setDbReady(true))
      .catch((err) => setDbError(err instanceof Error ? err.message : String(err)));
  }, [setDbReady]);

  // Open the active saved space (the shared page loads its own data instead).
  useEffect(() => {
    if (!dbReady || isSharedPage || initStarted.current) return;
    initStarted.current = true;
    void init();
  }, [dbReady, isSharedPage, init]);

  // The snippet library is shared by every space; load it once.
  useEffect(() => {
    if (hydrated) void useSnippetStore.getState().init();
  }, [hydrated]);

  // Invite links (?room=<id>) join the room once the workspace is ready.
  useEffect(() => {
    if (!hydrated || isSharedPage || roomJoinAttempted.current) return;
    roomJoinAttempted.current = true;
    const room = new URLSearchParams(location.search).get("room");
    if (!room || !/^[A-Za-z0-9_-]{1,64}$/.test(room)) return;
    void import("@/lib/collaboration/sync").then(({ connectToRoom }) =>
      connectToRoom(room).then(
        () => useUiStore.getState().toast(`Joined room ${room}.`, "success"),
        (err) => useUiStore.getState().toast(`Could not join room ${room}: ${err instanceof Error ? err.message : err}`, "error")
      )
    );
  }, [hydrated, isSharedPage]);

  // Understand the data up front: infer joins in the background once 2+ tables exist.
  const discoveryStatus = useWorkspaceStore((s) => s.discovery.status);
  useEffect(() => {
    if (!hydrated || tables.length < 2 || discoveryStatus !== "idle") return;
    const timer = setTimeout(() => void useWorkspaceStore.getState().discoverRelationships(), 600);
    return () => clearTimeout(timer);
  }, [hydrated, tables.length, discoveryStatus]);

  // Drop files anywhere on the page (only once the saved workspace is restored,
  // otherwise the restore would overwrite the dropped tables).
  useEffect(() => {
    if (isSharedPage || !hydrated) return;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current++;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const onLeave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = 0;
      setDragging(false);
      // A drop target inside the page already handled it (and called preventDefault).
      if (e.defaultPrevented) return;
      e.preventDefault();
      if (e.dataTransfer?.files.length) void importAndReport(Array.from(e.dataTransfer.files));
    };
    document.addEventListener("dragenter", onEnter);
    document.addEventListener("dragover", onOver);
    document.addEventListener("dragleave", onLeave);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onEnter);
      document.removeEventListener("dragover", onOver);
      document.removeEventListener("dragleave", onLeave);
      document.removeEventListener("drop", onDrop);
    };
  }, [isSharedPage, hydrated]);

  // Global shortcuts. Editor-local ones (run, AI) are also bound inside Monaco.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const ui = useUiStore.getState();
      const key = e.key.toLowerCase();
      if (mod && key === "p") {
        e.preventDefault();
        ui.setPaletteOpen(!ui.paletteOpen);
      } else if (mod && key === "k") {
        e.preventDefault();
        if (ui.aiOpen) ui.closeAi();
        else ui.openAi();
      } else if (mod && e.shiftKey && key === "s") {
        e.preventDefault();
        void saveCurrentAsSnippet();
      } else if (mod && key === "b") {
        e.preventDefault();
        ui.setSidebarOpen(!ui.sidebarOpen);
      } else if (mod && e.key === "Enter" && !isTypingTarget(e.target)) {
        e.preventDefault();
        runActive();
      } else if (e.key === "?" && !mod && !isTypingTarget(e.target)) {
        e.preventDefault();
        ui.setDialog("shortcuts");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (dbError) {
    return (
      <Splash
        tone="error"
        message="DuckDB could not start in this browser."
        detail={`${dbError}. QueryPad needs WebAssembly and Web Workers — try a current Chrome, Firefox, Edge or Safari.`}
      />
    );
  }
  if (!dbReady) return <Splash message="Starting DuckDB" />;
  if (!hydrated) return <Splash message={everHydrated.current ? "Opening space" : "Restoring your workspace"} />;

  return (
    <div className="flex h-dvh flex-col bg-paper text-ink">
      <Header />

      {onlySampleTables && !welcomeDismissed && !isSharedPage && (
        <div className="flex items-center gap-3 border-b border-line bg-accent-soft/60 px-4 py-1.5 text-[13px] text-ink">
          <span className="flex-1">
            You&apos;re exploring two sample tables. Drop your own files anywhere and they&apos;ll replace them.
          </span>
          <button
            onClick={() => {
              setWelcomeDismissed(true);
              localStorage.setItem(WELCOME_KEY, "1");
            }}
            className="text-muted hover:text-ink"
            aria-label="Dismiss"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {tables.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="flex min-w-0 flex-1 flex-col">
            {viewMode === "sql" ? <SqlWorkbench /> : <PipelineView />}
          </main>
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-2 z-50 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/50">
          <p className="rounded-lg bg-surface px-4 py-2 text-sm font-medium text-ink shadow-pop">
            Drop to add as tables
          </p>
        </div>
      )}

      {paletteOpen && <CommandPalette />}
      {dialog === "addFiles" && <AddFilesDialog onClose={() => setDialog(null)} />}
      {dialog === "collaborate" && <CollaborateDialog onClose={() => setDialog(null)} />}
      {dialog === "plugins" && <PluginManager onClose={() => setDialog(null)} />}
      {dialog === "shortcuts" && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {snippetDraft && <SnippetDialog key={snippetDraft.id ?? "new"} draft={snippetDraft} />}
      <Toaster />
    </div>
  );
}
