"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useWorkspaceStore, saveSharedAsSpace } from "@/stores/workspace-store";
import { PANEL_PAGES, useUiStore } from "@/stores/ui-store";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { shareWorkspace } from "@/lib/workspace-actions";
import RoomBar from "@/components/collaboration/RoomBar";
import { Icon } from "@/components/ui/icons";
import { MOD, btn, pressedTone } from "@/components/ui/primitives";
import { startFolder, startNotebook } from "./NavRail";

const crumb = "truncate rounded text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** The light bar above the work area: where you are, and the space-wide actions. */
export default function PageHeader() {
  const router = useRouter();
  const isSharedPage = usePathname() === "/shared";
  const page = useUiStore((s) => s.workspacePage);
  const tablePage = useUiStore((s) => s.tablePage);
  const notebookId = useUiStore((s) => s.notebookId);
  const notebookName = useWorkspaceStore((s) => (notebookId ? (s.notebooks.find((n) => n.id === notebookId)?.name ?? null) : null));
  const folderId = useUiStore((s) => s.folderId);
  const folderName = useWorkspaceStore((s) => (folderId ? (s.folders.find((f) => f.id === folderId)?.name ?? null) : null));
  const viewMode = useWorkspaceStore((s) => s.viewMode);
  const spaceName = useWorkspaceStore((s) => s.spaces.find((sp) => sp.id === s.spaceId)?.name);
  const hasTables = useWorkspaceStore((s) => s.tables.length > 0);
  const hasData = useWorkspaceStore((s) => s.tables.length + s.views.length > 0);
  const persistEnabled = useWorkspaceStore((s) => s.persistEnabled);
  const roomId = useCollaborationStore((s) => s.roomId);
  const assistantOpen = useUiStore((s) => s.assistantOpen);
  const tablesPanelOpen = useUiStore((s) => s.sidebarOpen && s.sidebarPanel === "tables");
  const setDialog = useUiStore((s) => s.setDialog);
  const toast = useUiStore((s) => s.toast);

  // The share encoder stays out of page load, but is fetched once the page is idle so Share can
  // write the link to the clipboard straight from the click (Safari drops a slow gesture).
  useEffect(() => {
    if (!hasTables) return;
    const timer = setTimeout(() => void import("@/lib/sharing/encode"), 4000);
    return () => clearTimeout(timer);
  }, [hasTables]);

  const space = isSharedPage ? "Shared link" : (spaceName ?? "Space");
  // Pages with a parent list show it as a crumb; the last crumb is the page itself.
  const parent: { label: string; onClick: () => void; aria: string } | null =
    page === "table"
      ? { label: "Tables", aria: "All tables", onClick: () => useUiStore.getState().setWorkspacePage("tables") }
      : page === "notebooks" && notebookId
        ? { label: "Notebooks", aria: "All notebooks", onClick: () => useUiStore.getState().openNotebook(null) }
        : page === "folders" && folderId
          ? { label: "Folders", aria: "All folders", onClick: () => useUiStore.getState().openFolder(null) }
          : null;
  const title =
    page === "home"
      ? "Home"
      : page === "table"
        ? (tablePage ?? "Table")
        : page === "tables"
          ? "Tables"
          : page === "agent"
            ? "Agent"
            : page === "notebooks"
              ? (notebookId ? (notebookName ?? "Notebook") : "Notebooks")
              : page === "folders"
                ? (folderId ? (folderName ?? "Folder") : "Folders")
                : viewMode === "sql"
                  ? "SQL"
                  : "Pipelines";

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-chrome px-3 sm:px-4">
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px]">
        {parent ? (
          <>
            <button onClick={() => useUiStore.getState().setWorkspacePage("home")} className={`${crumb} max-sm:hidden`} title={space}>{space}</button>
            <Icon name="chevronRight" size={14} className="text-faint max-sm:hidden" />
            <button onClick={parent.onClick} className={crumb} aria-label={parent.aria} title={`Open ${parent.label}`}>{parent.label}</button>
          </>
        ) : (
          <span className="truncate text-muted" title={space}>{space}</span>
        )}
        <Icon name="chevronRight" size={14} className="text-faint" />
        <span className={`font-semibold text-ink ${page === "table" ? "min-w-0 truncate font-mono" : "min-w-0 truncate"}`} aria-current="page">{title}</span>
      </nav>

      {isSharedPage && !persistEnabled && (
        <button
          onClick={() =>
            void saveSharedAsSpace("Shared link").then(() => {
              toast("Saved as a new space called Shared link. Your other spaces are untouched.", "success");
              router.replace("/");
            })
          }
          className={btn.secondary}
          title="Keeps a copy as a new space in your workspace"
        >
          Save as a new space
        </button>
      )}

      <div className="flex shrink-0 items-center gap-1.5">
        {PANEL_PAGES.has(page) && (
          <button
            onClick={() => useUiStore.getState().togglePanel("tables")}
            className={`${btn.bar} ${tablesPanelOpen ? pressedTone : ""}`}
            aria-pressed={tablesPanelOpen}
            aria-label="Tables panel"
            title={`Tables panel (${MOD}+B)`}
          >
            <Icon name="sidebar" size={16} />
            <span className="max-lg:hidden">Tables</span>
          </button>
        )}
        {page === "tables" && hasData && (
          <button onClick={() => setDialog("addFiles")} className={btn.secondary} aria-label="Add data" title="Add data">
            <Icon name="upload" size={16} />
            <span className="max-sm:hidden">Add data</span>
          </button>
        )}
        {page === "notebooks" && (
          <button onClick={() => startNotebook(null)} className={btn.secondary} aria-label="New notebook" title="New notebook">
            <Icon name="plus" size={16} />
            <span className="max-sm:hidden">New notebook</span>
          </button>
        )}
        {page === "folders" && (
          <button onClick={startFolder} className={btn.secondary} aria-label="New folder" title="New folder">
            <Icon name="folderPlus" size={16} />
            <span className="max-sm:hidden">New folder</span>
          </button>
        )}
        {roomId ? (
          <RoomBar />
        ) : (
          !isSharedPage && (
            <button onClick={() => setDialog("collaborate")} className={`${btn.bar} max-md:hidden`} aria-label="Collaborate" title="Collaborate">
              <Icon name="users" size={16} />
              Collaborate
            </button>
          )
        )}
        <button onClick={() => void shareWorkspace()} onPointerEnter={() => void import("@/lib/sharing/encode")} className={btn.bar} disabled={!hasTables} aria-label="Share" title="Share">
          <Icon name="link" size={16} />
          <span className="max-sm:hidden">Share</span>
        </button>
        {!isSharedPage && (
          <button
            onClick={() => {
              const ui = useUiStore.getState();
              // On phones the side panel floats over the page; close it before showing the Assistant.
              if (!assistantOpen && ui.sidebarOpen && window.innerWidth < 768) ui.setSidebarOpen(false);
              ui.setAssistantOpen(!assistantOpen);
            }}
            className={`${btn.bar} ${assistantOpen ? pressedTone : ""}`}
            aria-pressed={assistantOpen}
            aria-label="Assistant"
            title={`Assistant (${MOD}+I)`}
          >
            <Icon name="sparkle" size={16} />
            <span className="max-sm:hidden">Assistant</span>
          </button>
        )}
      </div>
    </header>
  );
}
