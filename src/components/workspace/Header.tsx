"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useWorkspaceStore, saveSharedAsSpace } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { shareWorkspace, copyAgentContext } from "@/lib/workspace-actions";
import RoomBar from "@/components/collaboration/RoomBar";
import { Icon, GithubMark } from "@/components/ui/icons";
import { Kbd, Menu, MOD, btn } from "@/components/ui/primitives";
import { BrandMark } from "./BrandMark";
import SpaceSwitcher from "./SpaceSwitcher";

const REPO_URL = "https://github.com/adminbjkai/querypad";

export default function Header() {
  const router = useRouter();
  const isSharedPage = usePathname() === "/shared";
  const viewMode = useWorkspaceStore((s) => s.viewMode);
  const setViewMode = useWorkspaceStore((s) => s.setViewMode);
  const hasTables = useWorkspaceStore((s) => s.tables.length > 0);
  const persistEnabled = useWorkspaceStore((s) => s.persistEnabled);
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);
  const roomId = useCollaborationStore((s) => s.roomId);
  const theme = useUiStore((s) => s.theme);
  const assistantOpen = useUiStore((s) => s.assistantOpen);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const setDialog = useUiStore((s) => s.setDialog);
  const toast = useUiStore((s) => s.toast);
  const [confirmClear, setConfirmClear] = useState(false);

  const askClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      toast("Open the menu and choose Clear again within 5 seconds to remove this space's tables, tabs and history.", "warning");
      setTimeout(() => setConfirmClear(false), 5000);
      return;
    }
    setConfirmClear(false);
    void clearWorkspace().then(() => toast("Space cleared."));
  };

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-chrome px-2 sm:px-3">
      {hasTables && (
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={btn.icon}
          aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          title={`Toggle sidebar (${MOD}+B)`}
        >
          <Icon name="sidebar" />
        </button>
      )}
      <Link href="/" className="flex items-center gap-2 rounded-md px-1 py-1" aria-label="QueryPad home">
        <BrandMark />
        <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">QueryPad</span>
      </Link>
      {!isSharedPage && (
        <>
          <span className="text-line-strong max-sm:hidden" aria-hidden="true">/</span>
          <SpaceSwitcher />
        </>
      )}

      {hasTables && (
        <div className="ml-1 flex rounded-lg bg-sunken p-0.5" role="tablist" aria-label="Mode">
          {(["sql", "pipeline"] as const).map((mode) => (
            <button
              key={mode}
              role="tab"
              aria-selected={viewMode === mode}
              onClick={() => setViewMode(mode)}
              className={`h-7 rounded-md px-2.5 text-[13px] transition-colors ${
                viewMode === mode ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {mode === "sql" ? "SQL" : "Pipeline"}
            </button>
          ))}
        </div>
      )}

      {isSharedPage && !persistEnabled && (
        <div className="ml-2 hidden items-center gap-2 md:flex">
          <span className="rounded-md bg-join-soft px-2 py-1 text-[12px] font-medium text-join">Shared link</span>
          <button
            onClick={() =>
              void saveSharedAsSpace("Shared link").then(() => {
                toast("Saved as a new space called Shared link. Your other spaces are untouched.", "success");
                router.replace("/");
              })
            }
            className={btn.ghost}
            title="Keeps a copy as a new space in your workspace"
          >
            Save as a new space
          </button>
        </div>
      )}

      <div className="flex flex-1 justify-center px-2">
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex h-8 w-full max-w-md items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-faint shadow-[0_1px_0_rgb(15_23_42/0.03)] transition-colors hover:border-line-strong hover:text-muted"
          aria-label="Open command palette"
        >
          <Icon name="search" size={14} />
          <span className="hidden flex-1 text-left sm:inline">Search tables, columns, snippets, history…</span>
          <span className="hidden gap-0.5 sm:flex">
            <Kbd>{MOD}</Kbd>
            <Kbd>P</Kbd>
          </span>
        </button>
      </div>

      <button
        onClick={() => useUiStore.getState().setAssistantOpen(!useUiStore.getState().assistantOpen)}
        className={`${btn.ghost} ${assistantOpen ? "bg-accent-soft text-accent" : ""}`}
        aria-pressed={assistantOpen}
        title={`Assistant (${MOD}+I)`}
      >
        <Icon name="sparkle" size={15} />
        <span className="max-lg:hidden">Assistant</span>
      </button>
      {roomId ? (
        <RoomBar />
      ) : (
        <button onClick={() => setDialog("collaborate")} className={`${btn.ghost} max-md:hidden`}>
          <Icon name="users" size={15} />
          Collaborate
        </button>
      )}
      <button
        onClick={toggleTheme}
        className={`${btn.icon} max-sm:hidden`}
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        title="Toggle theme"
      >
        <Icon name={theme === "dark" ? "sun" : "moon"} />
      </button>
      <button onClick={() => void shareWorkspace()} className={btn.secondary} disabled={!hasTables}>
        <Icon name="link" size={15} />
        <span className="hidden sm:inline">Share</span>
      </button>
      <Menu
        label="More"
        trigger={({ toggle, open }) => (
          <button onClick={toggle} className={btn.icon} aria-label="More" aria-expanded={open}>
            <Icon name="more" size={18} />
          </button>
        )}
        items={[
          { label: "Copy context for an agent", icon: "copy", onSelect: () => void copyAgentContext() },
          { label: "Collaborate", icon: "users", onSelect: () => setDialog("collaborate") },
          { label: "Plugins", icon: "puzzle", onSelect: () => setDialog("plugins") },
          { label: theme === "dark" ? "Light theme" : "Dark theme", icon: theme === "dark" ? "sun" : "moon", onSelect: toggleTheme },
          { label: "Keyboard shortcuts", icon: "keyboard", hint: "?", onSelect: () => setDialog("shortcuts") },
          { label: "Source on GitHub", icon: "file", onSelect: () => window.open(REPO_URL, "_blank", "noopener") },
          "divider",
          {
            label: confirmClear ? "Click to confirm clear" : "Clear this space",
            icon: "trash",
            danger: true,
            disabled: !hasTables,
            onSelect: askClear,
          },
        ]}
      />
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={`${btn.icon} max-lg:hidden`} aria-label="GitHub">
        <GithubMark />
      </a>
    </header>
  );
}
