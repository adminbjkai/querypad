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
  const viewMode = useWorkspaceStore((s) => s.viewMode);
  const spaceName = useWorkspaceStore((s) => s.spaces.find((sp) => sp.id === s.spaceId)?.name);
  const hasTables = useWorkspaceStore((s) => s.tables.length > 0);
  const persistEnabled = useWorkspaceStore((s) => s.persistEnabled);
  const roomId = useCollaborationStore((s) => s.roomId);
  const assistantOpen = useUiStore((s) => s.assistantOpen);
  const setDialog = useUiStore((s) => s.setDialog);
  const toast = useUiStore((s) => s.toast);

  const title = page === "home" ? "Home" : viewMode === "sql" ? "SQL" : "Pipelines";
  const space = isSharedPage ? "Shared link" : (spaceName ?? "Space");

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 sm:px-4">
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px]">
        <span className="truncate text-muted" title={space}>{space}</span>
        <Icon name="chevronRight" size={13} className="text-faint" />
        <span className="shrink-0 font-semibold text-ink" aria-current="page">{title}</span>
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
            <button onClick={() => setDialog("collaborate")} className={`${btn.ghost} max-md:hidden`}>
              <Icon name="users" size={15} />
              Collaborate
            </button>
          )
        )}
        <button onClick={() => void shareWorkspace()} className={btn.secondary} disabled={!hasTables} aria-label="Share">
          <Icon name="link" size={15} />
          <span className="max-sm:hidden">Share</span>
        </button>
        {!isSharedPage && (
          <button
            onClick={() => useUiStore.getState().setAssistantOpen(!assistantOpen)}
            className={`${btn.secondary} ${assistantOpen ? "border-accent/40 bg-accent-soft text-accent hover:bg-accent-soft" : ""}`}
            aria-pressed={assistantOpen}
            aria-label="Assistant"
            title={`Assistant (${MOD}+I)`}
          >
            <Icon name="sparkle" size={15} />
            <span className="max-sm:hidden">Assistant</span>
          </button>
        )}
      </div>
    </header>
  );
}
