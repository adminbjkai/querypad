"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useSnippetStore } from "@/stores/snippet-store";
import { useUiStore, type SidebarPanel } from "@/stores/ui-store";
import { copyAgentContext } from "@/lib/workspace-actions";
import { Icon, type IconName } from "@/components/ui/icons";
import { Kbd, Menu, MOD } from "@/components/ui/primitives";
import { BrandMark } from "./BrandMark";
import SpaceSwitcher from "./SpaceSwitcher";

const REPO_URL = "https://github.com/adminbjkai/querypad";

/** Phones always get the icon-only rail so the work area keeps its width. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
}

function NavItem({
  icon,
  label,
  collapsed,
  active,
  onClick,
  badge,
  pressed,
  current,
  hint,
}: {
  icon: IconName;
  label: string;
  collapsed: boolean;
  active: boolean;
  onClick: () => void;
  badge?: ReactNode;
  /** Toggles (panels) report aria-pressed; pages report aria-current. */
  pressed?: boolean;
  current?: boolean;
  hint?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={pressed}
      aria-current={current ? "page" : undefined}
      aria-label={label}
      title={collapsed ? (hint ? `${label} (${hint})` : label) : hint}
      className={`qp-nav-item group relative flex h-8 w-full items-center gap-2.5 rounded-lg text-[13px] transition-colors ${
        collapsed ? "justify-center" : "px-2.5"
      } ${active ? "bg-surface font-medium text-ink shadow-sm ring-1 ring-line" : "text-muted hover:bg-sunken hover:text-ink"}`}
    >
      {active && <span className="absolute -left-2 top-1.5 h-5 w-[3px] rounded-r bg-accent" aria-hidden="true" />}
      <Icon name={icon} size={16} className={active ? "text-accent" : ""} />
      {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{label}</span>}
      {badge != null && (
        <span
          className={`rounded-full px-1.5 text-[10px] font-medium leading-4 tabular-nums ${
            collapsed ? "absolute right-0.5 top-0 bg-join-soft text-join" : "bg-sunken text-faint group-hover:bg-raised"
          }`}
          aria-hidden="true"
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function Section({ label, collapsed, children }: { label: string; collapsed: boolean; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="mt-4 first:mt-0">
      {collapsed ? (
        <div className="mx-auto mb-1.5 h-px w-5 bg-line" aria-hidden="true" />
      ) : (
        <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-faint" aria-hidden="true">
          {label}
        </p>
      )}
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

/** The app's left navigation: pages, data and library panels, the space, and app settings. */
export default function NavRail() {
  const isSharedPage = usePathname() === "/shared";
  const page = useUiStore((s) => s.workspacePage);
  const setPage = useUiStore((s) => s.setWorkspacePage);
  const viewMode = useWorkspaceStore((s) => s.viewMode);
  const setViewMode = useWorkspaceStore((s) => s.setViewMode);
  const tableCount = useWorkspaceStore((s) => s.tables.length + s.views.length);
  const joinCount = useWorkspaceStore((s) => (s.discovery.status === "ready" ? s.discovery.relationships.length : 0));
  const historyCount = useWorkspaceStore((s) => s.history.length);
  const snippetCount = useSnippetStore((s) => s.snippets.length);
  const panelOpen = useUiStore((s) => s.sidebarOpen);
  const panel = useUiStore((s) => s.sidebarPanel);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const setDialog = useUiStore((s) => s.setDialog);
  const collapsedPref = useUiStore((s) => s.navCollapsed);
  const setCollapsed = useUiStore((s) => s.setNavCollapsed);
  const narrow = useNarrow();
  const collapsed = narrow || collapsedPref;

  const onWorkbench = page === "workbench";
  const goSql = () => {
    setViewMode("sql");
    setPage("workbench");
  };
  const goPipeline = () => {
    setViewMode("pipeline");
    setPage("workbench");
  };
  const openPanel = (id: SidebarPanel) => {
    const ui = useUiStore.getState();
    if (ui.workspacePage !== "workbench") {
      ui.setWorkspacePage("workbench");
      ui.showPanel(id);
    } else {
      ui.togglePanel(id);
    }
  };
  const newQuery = () => {
    setViewMode("sql");
    if (useWorkspaceStore.getState().addTab()) setPage("workbench");
  };
  const panelItem = (id: SidebarPanel, icon: IconName, label: string, count: number, hint?: string) => {
    const active = onWorkbench && panelOpen && panel === id;
    return (
      <NavItem
        key={id}
        icon={icon}
        label={label}
        collapsed={collapsed}
        active={active}
        pressed={active}
        onClick={() => openPanel(id)}
        badge={count > 0 && (!collapsed || id === "joins") ? (count > 99 ? "99+" : count) : undefined}
        hint={hint}
      />
    );
  };

  return (
    <nav
      aria-label="Main"
      className={`qp-nav flex h-full shrink-0 flex-col border-r border-line bg-chrome transition-[width] duration-200 ${
        collapsed ? "w-[52px]" : "w-[228px]"
      }`}
    >
      <div className={`flex h-12 shrink-0 items-center ${collapsed ? "justify-center" : "justify-between pl-3 pr-2"}`}>
        {!collapsed && (
          <Link href="/" className="flex min-w-0 items-center gap-2 rounded-md py-1 pr-1" aria-label="QueryPad home">
            <BrandMark size={20} />
            <span className="text-[15px] font-semibold tracking-tight text-ink">QueryPad</span>
          </Link>
        )}
        {!narrow && (
          <button
            onClick={() => setCollapsed(!collapsedPref)}
            className="inline-flex size-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {collapsed ? <BrandMark size={20} /> : <Icon name="sidebar" size={16} />}
          </button>
        )}
        {narrow && <BrandMark size={20} />}
      </div>

      {!isSharedPage && (
        <div className={`shrink-0 ${collapsed ? "flex justify-center" : "px-2"}`}>
          <SpaceSwitcher compact={collapsed} />
        </div>
      )}

      <div className={`mt-2 flex shrink-0 gap-1 ${collapsed ? "flex-col items-center" : "px-2"}`}>
        <button
          onClick={() => useUiStore.getState().setPaletteOpen(true)}
          className={`flex h-8 items-center gap-2 rounded-lg border border-line bg-surface text-[13px] text-faint shadow-sm transition-colors hover:border-line-strong hover:text-ink ${
            collapsed ? "w-9 justify-center" : "min-w-0 flex-1 px-2.5"
          }`}
          aria-label="Open command palette"
          title={`Search (${MOD}+P)`}
        >
          <Icon name="search" size={14} />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-left">Search</span>
              <span className="flex gap-0.5">
                <Kbd>{MOD}</Kbd>
                <Kbd>P</Kbd>
              </span>
            </>
          )}
        </button>
        <button
          onClick={newQuery}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-chrome"
          aria-label="New query"
          title="New query"
        >
          <Icon name="plus" size={16} />
        </button>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <Section label="Work" collapsed={collapsed}>
          <NavItem icon="home" label="Home" collapsed={collapsed} active={page === "home"} current={page === "home"} onClick={() => setPage("home")} />
          <NavItem
            icon="code"
            label="SQL"
            collapsed={collapsed}
            active={onWorkbench && viewMode === "sql"}
            current={onWorkbench && viewMode === "sql"}
            onClick={goSql}
          />
          <NavItem
            icon="flow"
            label="Pipelines"
            collapsed={collapsed}
            active={onWorkbench && viewMode === "pipeline"}
            current={onWorkbench && viewMode === "pipeline"}
            onClick={goPipeline}
          />
        </Section>
        <Section label="Data" collapsed={collapsed}>
          {panelItem("tables", "table", "Tables", tableCount, `${MOD}+B`)}
          {panelItem("joins", "join", "Joins", joinCount)}
        </Section>
        <Section label="Library" collapsed={collapsed}>
          {panelItem("history", "history", "History", historyCount)}
          {panelItem("snippets", "bookmark", "Snippets", snippetCount)}
        </Section>
      </div>

      <div className={`flex shrink-0 gap-1 border-t border-line py-2 ${collapsed ? "flex-col items-center" : "items-center px-2"}`}>
        <button
          onClick={toggleTheme}
          className="inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink"
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          title="Toggle theme"
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>
        <button
          onClick={() => setDialog("shortcuts")}
          className="inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
        >
          <Icon name="keyboard" />
        </button>
        <div className={collapsed ? "" : "ml-auto"}>
          <Menu
            label="More"
            side="top"
            align="left"
            trigger={({ toggle, open }) => (
              <button
                onClick={toggle}
                className={`inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink ${open ? "bg-sunken text-ink" : ""}`}
                aria-label="More"
                aria-expanded={open}
              >
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
              { label: "Clear this space…", icon: "trash", danger: true, disabled: tableCount === 0, onSelect: () => useUiStore.getState().setDialog("clearSpace") },
            ]}
          />
        </div>
      </div>
    </nav>
  );
}
