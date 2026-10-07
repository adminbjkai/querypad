"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { getDB } from "@/lib/duckdb/instance";
import { SAMPLE_TABLE_NAMES } from "@/lib/constants";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useSnippetStore, saveCurrentAsSnippet } from "@/stores/snippet-store";
import { useAiStore } from "@/stores/ai-store";
import { PANEL_PAGES, useUiStore } from "@/stores/ui-store";
import { importAndReport } from "@/lib/import";
import { runActive } from "@/lib/workspace-actions";
import NavRail from "./NavRail";
import PageHeader from "./PageHeader";
import StatusBar from "./StatusBar";
import Splash from "./Splash";
import Sidebar from "@/components/sidebar/Sidebar";
import SqlWorkbench from "@/components/editor/SqlWorkbench";
import Toaster from "@/components/ui/Toaster";
import { Icon } from "@/components/ui/icons";
import { btn } from "@/components/ui/primitives";

const PipelineView = dynamic(() => import("@/components/pipeline/PipelineView"), { ssr: false });
const Home = dynamic(() => import("./Home"), { ssr: false });
const TablePage = dynamic(() => import("./TablePage"), { ssr: false });
const TablesPage = dynamic(() => import("./TablesPage"), { ssr: false });
const AgentPage = dynamic(() => import("./AgentPage"), { ssr: false });
const NotebooksPage = dynamic(() => import("@/components/notebook/NotebooksPage"), { ssr: false });
const FoldersPage = dynamic(() => import("@/components/library/FoldersPage"), { ssr: false });
const CommandPalette = dynamic(() => import("./CommandPalette"), { ssr: false });
const AddFilesDialog = dynamic(() => import("@/components/dropzone/AddFilesDialog"), { ssr: false });
const CollaborateDialog = dynamic(() => import("@/components/collaboration/CollaborateDialog"), { ssr: false });
const PluginManager = dynamic(() => import("@/components/plugins/PluginManager"), { ssr: false });
const ShortcutsDialog = dynamic(() => import("./ShortcutsDialog"), { ssr: false });
const ClearSpaceDialog = dynamic(() => import("./ClearSpaceDialog"), { ssr: false });
const SnippetDialog = dynamic(() => import("@/components/editor/SnippetDialog"), { ssr: false });
const AssistantPanel = dynamic(() => import("@/components/assistant/AssistantPanel"), { ssr: false });
const AssistantRail = dynamic(() => import("@/components/assistant/AssistantPanel").then((m) => m.AssistantRail), { ssr: false });

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.closest(".monaco-editor"));
}

/** True while a modal dialog, the palette or a menu is open anywhere in the document. */
function layerOpen(): boolean {
  return !!document.querySelector('[role="dialog"][aria-modal="true"], [role="menu"]');
}

/** "G then letter" navigation chords (outside text fields): the pages of the rail. */
const GO_KEYS: Record<string, () => void> = {
  h: () => useUiStore.getState().setWorkspacePage("home"),
  a: () => useUiStore.getState().setWorkspacePage("agent"),
  s: () => {
    useWorkspaceStore.getState().setViewMode("sql");
    useUiStore.getState().setWorkspacePage("workbench");
  },
  n: () => useUiStore.getState().openNotebook(null),
  p: () => {
    useWorkspaceStore.getState().setViewMode("pipeline");
    useUiStore.getState().setWorkspacePage("workbench");
  },
  t: () => useUiStore.getState().setWorkspacePage("tables"),
  f: () => useUiStore.getState().openFolder(null),
};
const GO_CHORD_MS = 800;

export default function Workspace() {
  const setDbReady = useWorkspaceStore((s) => s.setDbReady);
  const hydrated = useWorkspaceStore((s) => s._hydrated);
  const init = useWorkspaceStore((s) => s.init);
  const tables = useWorkspaceStore((s) => s.tables);
  const dataCount = useWorkspaceStore((s) => s.tables.length + s.views.length);
  const spaceId = useWorkspaceStore((s) => s.spaceId);
  const viewMode = useWorkspaceStore((s) => s.viewMode);
  const workspacePage = useUiStore((s) => s.workspacePage);

  const dialog = useUiStore((s) => s.dialog);
  const setDialog = useUiStore((s) => s.setDialog);
  const paletteOpen = useUiStore((s) => s.paletteOpen);
  const snippetDraft = useSnippetStore((s) => s.draft);
  const assistantOpen = useUiStore((s) => s.assistantOpen);

  const isSharedPage = usePathname() === "/shared";
  const [dbError, setDbError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const sampleHintDismissed = useUiStore((s) => !!spaceId && s.dismissedSampleHints.includes(spaceId));
  const initStarted = useRef(false);
  const roomJoinAttempted = useRef(false);
  const dragDepth = useRef(0);

  const onlySampleTables = tables.length > 0 && tables.every((t) => SAMPLE_TABLE_NAMES.has(t.name));

  useEffect(() => {
    getDB()
      .then(() => setDbReady(true))
      .catch((err) => setDbError(err instanceof Error ? err.message : String(err)));
  }, [setDbReady]);

  // Open the active saved space (the shared page loads its own data instead). This does not wait for
  // the engine: the space index and file bytes download while DuckDB starts.
  useEffect(() => {
    if (isSharedPage || initStarted.current) return;
    initStarted.current = true;
    void init();
  }, [isSharedPage, init]);

  // Load the shared snippet library and the AI model choice once.
  useEffect(() => {
    if (!hydrated) return;
    void useSnippetStore.getState().init();
    void useAiStore.getState().init();
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

  // An empty space shows Home (where data is added); data arriving — added, or by switching away
  // from an empty space — opens the workbench. A table page never outlives its space, and an open
  // notebook or folder (ids belong to one space) falls back to its list.
  const seenData = useRef<{ space: string | null; count: number } | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    const prev = seenData.current;
    seenData.current = { space: spaceId, count: dataCount };
    const ui = useUiStore.getState();
    const setPage = ui.setWorkspacePage;
    if (prev && prev.space !== spaceId) {
      if (ui.workspacePage === "notebooks" && ui.notebookId) ui.openNotebook(null);
      else if (ui.workspacePage === "folders" && ui.folderId) ui.openFolder(null);
    }
    if (!prev) {
      if (dataCount === 0) setPage("home");
    } else if (prev.count === 0 && dataCount > 0) {
      setPage("workbench");
    } else if (dataCount === 0 && (prev.count > 0 || prev.space !== spaceId)) {
      setPage("home");
    } else if (prev.space !== spaceId && ui.workspacePage === "table") {
      setPage("workbench");
    }
  }, [hydrated, spaceId, dataCount]);

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
    let goArmedAt = 0;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const ui = useUiStore.getState();
      const key = e.key.toLowerCase();
      // Chords only on the page itself: not while typing, and not under any open dialog or menu
      // (local-state dialogs such as Add data or Save query are not in the ui store).
      if (!mod && !e.altKey && !isTypingTarget(e.target) && ui.dialog === null && !ui.paletteOpen && !layerOpen()) {
        if (goArmedAt && Date.now() - goArmedAt < GO_CHORD_MS && GO_KEYS[key]) {
          goArmedAt = 0;
          e.preventDefault();
          GO_KEYS[key]();
          return;
        }
        goArmedAt = key === "g" ? Date.now() : 0;
      }
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
      } else if (mod && key === "i") {
        e.preventDefault();
        // On phones the side panel floats over the page; close it so the Assistant is reachable.
        if (!ui.assistantOpen && ui.sidebarOpen && window.innerWidth < 768) ui.setSidebarOpen(false);
        ui.setAssistantOpen(!ui.assistantOpen);
      } else if (mod && key === "b") {
        e.preventDefault();
        ui.toggleSidePanel();
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

  return (
    <div className="flex h-dvh flex-col bg-paper text-ink">

      <div className="flex min-h-0 flex-1">
        <NavRail />
        {PANEL_PAGES.has(workspacePage) && <Sidebar />}
        <div className="relative flex min-w-0 flex-1 flex-col md:min-w-[320px]">
          <PageHeader />
          {onlySampleTables && !sampleHintDismissed && !isSharedPage && (
            <div role="note" className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-accent-soft px-3 text-[13px] text-ink sm:px-4">
              <Icon name="sparkle" size={14} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate">
                You&apos;re exploring two sample tables. Drop your own files anywhere and they&apos;ll replace them.
              </span>
              <button onClick={() => setDialog("addFiles")} className={`${btn.ghost} h-7 shrink-0 text-accent hover:bg-surface`}>
                Use my own data
              </button>
              <button
                onClick={() => spaceId && useUiStore.getState().dismissSampleHint(spaceId)}
                className={`${btn.icon} size-7 shrink-0`}
                aria-label="Dismiss"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          )}
          <main id="workspace-content" className="flex min-h-0 min-w-0 flex-1 flex-col" tabIndex={-1}>
            {workspacePage === "home" ? (
              <Home />
            ) : workspacePage === "table" ? (
              <TablePage />
            ) : workspacePage === "tables" ? (
              <TablesPage />
            ) : workspacePage === "agent" ? (
              <AgentPage />
            ) : workspacePage === "notebooks" ? (
              <NotebooksPage />
            ) : workspacePage === "folders" ? (
              <FoldersPage />
            ) : viewMode === "sql" ? (
              <SqlWorkbench />
            ) : (
              <PipelineView />
            )}
          </main>
        </div>
        {!isSharedPage && (assistantOpen ? <AssistantPanel /> : <AssistantRail />)}
      </div>
      <StatusBar />

      {dragging && (
        <div className="pointer-events-none fixed inset-2 z-50 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/50">
          <p className="rounded-lg bg-surface px-4 py-2 text-[14px] font-medium text-ink shadow-pop">
            Drop to add as tables
          </p>
        </div>
      )}

      {paletteOpen && <CommandPalette />}
      {dialog === "addFiles" && <AddFilesDialog onClose={() => setDialog(null)} />}
      {dialog === "collaborate" && <CollaborateDialog onClose={() => setDialog(null)} />}
      {dialog === "plugins" && <PluginManager onClose={() => setDialog(null)} />}
      {dialog === "shortcuts" && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {dialog === "clearSpace" && <ClearSpaceDialog onClose={() => setDialog(null)} />}
      {snippetDraft && <SnippetDialog key={snippetDraft.id ?? "new"} draft={snippetDraft} />}
      <Toaster />
    </div>
  );
}
