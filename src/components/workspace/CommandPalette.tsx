"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { runActive, previewTable, shareWorkspace, copyAgentContext } from "@/lib/workspace-actions";
import { Icon, type IconName } from "@/components/ui/icons";
import { MOD } from "@/components/ui/primitives";

interface Command {
  id: string;
  group: "Actions" | "Spaces" | "Tables" | "Tabs" | "History";
  label: string;
  detail?: string;
  icon: IconName;
  hint?: string;
  run: () => void;
}

/** Fuzzy-ish match: every query word must appear in the label or detail. */
function matches(command: Command, query: string): boolean {
  const haystack = `${command.label} ${command.detail ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export default function CommandPalette() {
  const close = () => useUiStore.getState().setPaletteOpen(false);
  const tables = useWorkspaceStore((s) => s.tables);
  const tabs = useWorkspaceStore((s) => s.tabs);
  const history = useWorkspaceStore((s) => s.history);
  const spaces = useWorkspaceStore((s) => s.spaces);
  const spaceId = useWorkspaceStore((s) => s.spaceId);
  const views = useWorkspaceStore((s) => s.views);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const commands = useMemo<Command[]>(() => {
    const ws = useWorkspaceStore.getState;
    const ui = useUiStore.getState;
    const actions: Command[] = [
      { id: "run", group: "Actions", label: "Run query", detail: "execute selection", icon: "play", hint: `${MOD} ↵`, run: runActive },
      { id: "ai", group: "Actions", label: "Ask AI to write SQL", icon: "sparkle", hint: `${MOD} K`, run: () => ui().openAi() },
      { id: "new-tab", group: "Actions", label: "New query tab", icon: "plus", run: () => ws().addTab() },
      { id: "add", group: "Actions", label: "Add data files", detail: "import upload url", icon: "upload", run: () => ui().setDialog("addFiles") },
      { id: "joins", group: "Actions", label: "Show relationships", detail: "joins keys discover", icon: "join", run: () => ui().showPanel("joins") },
      { id: "history", group: "Actions", label: "Show query history", icon: "history", run: () => ui().showPanel("history") },
      { id: "mode", group: "Actions", label: ws().viewMode === "sql" ? "Switch to pipeline mode" : "Switch to SQL mode", icon: "flow", run: () => ws().setViewMode(ws().viewMode === "sql" ? "pipeline" : "sql") },
      { id: "share", group: "Actions", label: "Copy share link", detail: "url", icon: "link", run: () => void shareWorkspace() },
      { id: "context", group: "Actions", label: "Copy context for an agent", detail: "claude codex", icon: "copy", run: () => void copyAgentContext() },
      { id: "theme", group: "Actions", label: ui().theme === "dark" ? "Use light theme" : "Use dark theme", detail: "appearance", icon: ui().theme === "dark" ? "sun" : "moon", run: () => ui().toggleTheme() },
      { id: "sidebar", group: "Actions", label: "Toggle sidebar", icon: "sidebar", hint: `${MOD} B`, run: () => ui().setSidebarOpen(!ui().sidebarOpen) },
      { id: "collab", group: "Actions", label: "Collaborate in a room", detail: "share live", icon: "users", run: () => ui().setDialog("collaborate") },
      { id: "plugins", group: "Actions", label: "Manage plugins", icon: "puzzle", run: () => ui().setDialog("plugins") },
      { id: "keys", group: "Actions", label: "Keyboard shortcuts", icon: "keyboard", hint: "?", run: () => ui().setDialog("shortcuts") },
    ];
    const spaceCommands: Command[] = [
      { id: "space:menu", group: "Spaces", label: "Save as new space", detail: "duplicate copy session", icon: "copy", run: () => ui().setSpaceMenuOpen(true) },
      { id: "space:new", group: "Spaces", label: "New space from sample data", detail: "fresh template playground", icon: "plus", run: () => ui().setSpaceMenuOpen(true) },
      ...spaces
        .filter((sp) => sp.id !== spaceId)
        .map((sp) => ({
          id: `space:${sp.id}`,
          group: "Spaces" as const,
          label: `Open space ${sp.name}`,
          detail: `${sp.tableCount} tables switch`,
          icon: "table" as const,
          run: () => void ws().switchSpace(sp.id),
        })),
    ];
    const viewCommands: Command[] = views.map((v) => ({
      id: `preview-view:${v.name}`,
      group: "Tables",
      label: `Preview view ${v.name}`,
      detail: v.columns.map((c) => c.name).join(" "),
      icon: "table",
      run: () => previewTable(v.name),
    }));
    const tableCommands: Command[] = tables.flatMap((t) => [
      {
        id: `preview:${t.name}`,
        group: "Tables" as const,
        label: `Preview ${t.name}`,
        detail: `${t.rowCount.toLocaleString()} rows ${t.columns.map((c) => c.name).join(" ")}`,
        icon: "table" as const,
        run: () => previewTable(t.name),
      },
      {
        id: `profile:${t.name}`,
        group: "Tables" as const,
        label: `Profile ${t.name}`,
        detail: "stats nulls distinct",
        icon: "profile" as const,
        run: () => ui().setProfileTable(t.name),
      },
    ]);
    const tabCommands: Command[] = tabs.map((t) => ({
      id: `tab:${t.id}`,
      group: "Tabs",
      label: `Go to ${t.title}`,
      detail: t.query.slice(0, 80),
      icon: "file",
      run: () => {
        ws().setViewMode("sql");
        ws().setActiveTab(t.id);
      },
    }));
    const historyCommands: Command[] = history.slice(0, 30).map((h) => ({
      id: `history:${h.id}`,
      group: "History",
      label: h.sql.replace(/\s+/g, " ").slice(0, 90),
      detail: h.error ? "failed" : `${h.rowCount?.toLocaleString()} rows`,
      icon: "history",
      run: () => ws().addTab(h.sql),
    }));
    return [...actions, ...spaceCommands, ...tableCommands, ...viewCommands, ...tabCommands, ...historyCommands];
  }, [tables, views, tabs, history, spaces, spaceId]);

  const visible = useMemo(() => {
    if (!query.trim()) return commands.filter((c) => c.group !== "History").slice(0, 40);
    return commands.filter((c) => matches(c, query)).slice(0, 60);
  }, [commands, query]);

  const selected = Math.min(index, Math.max(0, visible.length - 1));

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const choose = (command: Command | undefined) => {
    if (!command) return;
    close();
    command.run();
  };

  let lastGroup = "";
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-scrim p-4 pt-[14vh]"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div role="dialog" aria-label="Command palette" className="qp-pop w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Icon name="search" className="text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, visible.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(visible[selected]);
              } else if (e.key === "Escape") {
                close();
              }
            }}
            placeholder="Type a command, table, or past query"
            className="h-11 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-faint"
            aria-label="Search commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="qp-palette-list"
          />
        </div>
        <div ref={listRef} id="qp-palette-list" role="listbox" className="max-h-[52vh] overflow-y-auto p-1.5">
          {visible.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-muted">Nothing matches “{query}”.</p>}
          {visible.map((command, i) => {
            const header = command.group !== lastGroup;
            lastGroup = command.group;
            return (
              <div key={command.id}>
                {header && <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-faint">{command.group}</p>}
                <button
                  data-index={i}
                  role="option"
                  aria-selected={i === selected}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => choose(command)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] ${
                    i === selected ? "bg-accent-soft text-ink" : "text-ink"
                  }`}
                >
                  <Icon name={command.icon} className={i === selected ? "text-accent" : "text-muted"} />
                  <span className={`min-w-0 flex-1 truncate ${command.group === "History" ? "font-mono text-[12px]" : ""}`}>
                    {command.label}
                  </span>
                  {command.hint && <span className="text-[11px] text-faint">{command.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
