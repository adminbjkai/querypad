"use client";

import { useRouter, usePathname } from "next/navigation";
import { useWorkspaceStore, saveSharedAsSpace } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { shareWorkspace } from "@/lib/workspace-actions";
import RoomBar from "@/components/collaboration/RoomBar";
import { Icon } from "@/components/ui/icons";
import { MOD, btn } from "@/components/ui/primitives";

/** The light bar above the work area: where you are, and the space-wide actions. */
export default function PageHeader() {
  const router = useRouter();
  const isSharedPage = usePathname() === "/shared";
  const page = useUiStore((s) => s.workspacePage);
  const tablePage = useUiStore((s) => s.tablePage);
  const viewMode = useWorkspaceStore((s) => s.viewMode);
  const spaceName = useWorkspaceStore((s) => s.spaces.find((sp) => sp.id === s.spaceId)?.name);
  const hasTables = useWorkspaceStore((s) => s.tables.length > 0);
  const persistEnabled = useWorkspaceStore((s) => s.persistEnabled);
  const roomId = useCollaborationStore((s) => s.roomId);
  const assistantOpen = useUiStore((s) => s.assistantOpen);
  const setDialog = useUiStore((s) => s.setDialog);
  const toast = useUiStore((s) => s.toast);

  const title = page === "home" ? "Home" : page === "table" ? (tablePage ?? "Table") : viewMode === "sql" ? "SQL" : "Pipelines";
  const space = isSharedPage ? "Shared link" : (spaceName ?? "Space");
  const crumb = "truncate rounded font-medium text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
  const openTablesPanel = () => {
    const ui = useUiStore.getState();
    ui.setWorkspacePage("workbench");
    ui.showPanel("tables");
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-chrome px-3 sm:px-4">
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px]">
        {page === "table" ? (
          <>
            <button onClick={() => useUiStore.getState().setWorkspacePage("home")} className={`${crumb} max-sm:hidden`} title={space}>{space}</button>
            <Icon name="chevronRight" size={14} className="text-faint max-sm:hidden" />
            <button onClick={openTablesPanel} className={crumb} aria-label="All tables" title="Open the Tables panel">Tables</button>
          </>
        ) : (
          <span className="truncate font-medium text-muted" title={space}>{space}</span>
        )}
        <Icon name="chevronRight" size={14} className="text-faint" />
        <span className={`font-semibold text-ink ${page === "table" ? "min-w-0 truncate font-mono" : "shrink-0"}`} aria-current="page">{title}</span>
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
        {roomId ? (
          <RoomBar />
        ) : (
          !isSharedPage && (
            <button onClick={() => setDialog("collaborate")} className={`${btn.secondary} max-md:hidden`} aria-label="Collaborate" title="Collaborate">
              <Icon name="users" size={16} />
              Collaborate
            </button>
          )
        )}
        <button onClick={() => void shareWorkspace()} className={btn.secondary} disabled={!hasTables} aria-label="Share" title="Share">
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
            className={`${btn.secondary} ${assistantOpen ? "bg-accent-soft text-accent hover:bg-accent-soft" : ""}`}
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
