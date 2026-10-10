"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { runActive, previewTable, shareWorkspace, copyAgentContext, insertSnippet, openSnippet, openTablePage } from "@/lib/workspace-actions";
import { useSnippetStore, saveCurrentAsSnippet } from "@/stores/snippet-store";
import { Icon, type IconName } from "@/components/ui/icons";
import { Kbd, MOD, SectionLabel } from "@/components/ui/primitives";
import { useFocusTrap } from "@/lib/hooks/use-focus-trap";
import { startFolder, startNotebook } from "./NavRail";
import { insertAtCursor } from "@/lib/editor-bridge";
import { quoteIdent } from "@/lib/duckdb/sql-utils";

interface Command {
  id: string;
  group: "Actions" | "Spaces" | "Library" | "Snippets" | "Tables" | "Columns" | "Tabs" | "History";
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
  const snippets = useSnippetStore((s) => s.snippets);
  const notebooks = useWorkspaceStore((s) => s.notebooks);
  const folders = useWorkspaceStore((s) => s.folders);
  const savedQueries = useWorkspaceStore((s) => s.savedQueries);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useFocusTrap(dialogRef, true, inputRef);

  const commands = useMemo<Command[]>(() => {
    const ws = useWorkspaceStore.getState;
    const ui = useUiStore.getState;
    const actions: Command[] = [
      { id: "run", group: "Actions", label: "Run query", detail: "execute selection", icon: "play", hint: `${MOD} ↵`, run: runActive },
      { id: "home", group: "Actions", label: "Go to Home", detail: "overview datasets relationships ask", icon: "home", hint: "G H", run: () => ui().setWorkspacePage("home") },
      { id: "go:sql", group: "Actions", label: "Go to SQL", detail: "editor workbench queries", icon: "code", hint: "G S", run: () => { ws().setViewMode("sql"); ui().setWorkspacePage("workbench"); } },
      { id: "go:tables", group: "Actions", label: "Go to Tables", detail: "catalog datasets views", icon: "table", hint: "G T", run: () => ui().setWorkspacePage("tables") },
      { id: "go:agent", group: "Actions", label: "Go to Agent", detail: "tasks multi-step", icon: "agent", hint: "G A", run: () => ui().setWorkspacePage("agent") },
      { id: "go:notebooks", group: "Actions", label: "Go to Notebooks", detail: "cells markdown sql", icon: "notebook", hint: "G N", run: () => ui().openNotebook(null) },
      { id: "go:folders", group: "Actions", label: "Go to Folders", detail: "library saved queries", icon: "folder", hint: "G F", run: () => ui().openFolder(null) },
      { id: "new:notebook", group: "Actions", label: "New notebook", detail: "create cells", icon: "notebook", run: () => startNotebook() },
      { id: "new:folder", group: "Actions", label: "New folder", detail: "create library", icon: "folderPlus", run: startFolder },
      { id: "ai", group: "Actions", label: "Ask AI to write SQL", icon: "sparkle", hint: `${MOD} K`, run: () => ui().openAi() },
      { id: "assistant", group: "Actions", label: "Open the Assistant chat", detail: "ask questions explain help", icon: "sparkle", hint: `${MOD} I`, run: () => ui().setAssistantOpen(true) },
      { id: "new-tab", group: "Actions", label: "New query tab", icon: "plus", run: () => { ui().setWorkspacePage("workbench"); ws().addTab(); } },
      { id: "add", group: "Actions", label: "Add data files", detail: "import upload url", icon: "upload", run: () => ui().setDialog("addFiles") },
      { id: "joins", group: "Actions", label: "Show relationships", detail: "joins keys discover", icon: "join", run: () => ui().openPanel("joins") },
      { id: "history", group: "Actions", label: "Show query history", icon: "history", run: () => ui().openPanel("history") },
      { id: "snippet:save", group: "Actions", label: "Save query as snippet", detail: "bookmark library selection", icon: "bookmark", hint: `${MOD} ⇧ S`, run: () => void saveCurrentAsSnippet() },
      { id: "snippets", group: "Actions", label: "Show snippet library", detail: "saved sql", icon: "bookmark", run: () => ui().openPanel("snippets") },
      { id: "mode", group: "Actions", label: ws().viewMode === "sql" ? "Switch to pipeline mode" : "Switch to SQL mode", icon: "flow", run: () => { ui().setWorkspacePage("workbench"); ws().setViewMode(ws().viewMode === "sql" ? "pipeline" : "sql"); } },
      { id: "designer", group: "Actions", label: ui().designerOpen ? "Switch to SQL editor" : "Open Visual Query Designer", detail: "visual query builder joins filters columns", icon: "table", run: () => { ui().setWorkspacePage("workbench"); ui().toggleDesigner(); } },
      { id: "share", group: "Actions", label: "Copy share link", detail: "url", icon: "link", run: () => void shareWorkspace() },
      { id: "context", group: "Actions", label: "Copy context for an agent", detail: "claude codex", icon: "copy", run: () => void copyAgentContext() },
      { id: "theme", group: "Actions", label: ui().theme === "dark" ? "Use light theme" : "Use dark theme", detail: "appearance", icon: ui().theme === "dark" ? "sun" : "moon", run: () => ui().toggleTheme() },
      { id: "sidebar", group: "Actions", label: "Show or hide the Tables panel", detail: "sidebar explorer side panel resize collapse drag", icon: "sidebar", hint: `${MOD} B`, run: () => ui().toggleSidePanel() },
      { id: "nav", group: "Actions", label: ui().navCollapsed ? "Expand the navigation" : "Collapse the navigation", detail: "sidebar menu icons", icon: "sidebar", run: () => ui().setNavCollapsed(!ui().navCollapsed) },
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
    const libraryCommands: Command[] = [
      ...notebooks.map((n) => ({
        id: `notebook:${n.id}`,
        group: "Library" as const,
        label: `Open notebook ${n.name}`,
        detail: `${n.cells.length} cells ${folders.find((f) => f.id === n.folderId)?.name ?? ""}`,
        icon: "notebook" as const,
        run: () => ui().openNotebook(n.id),
      })),
      ...folders.map((f) => ({
        id: `folder:${f.id}`,
        group: "Library" as const,
        label: `Open folder ${f.name}`,
        detail: "library queries notebooks",
        icon: "folder" as const,
        run: () => ui().openFolder(f.id),
      })),
      ...savedQueries.map((q) => ({
        id: `saved:${q.id}`,
        group: "Library" as const,
        label: `Open saved query ${q.name}`,
        detail: `${folders.find((f) => f.id === q.folderId)?.name ?? ""} ${q.sql.slice(0, 120)}`,
        icon: "code" as const,
        run: () => {
          ws().setViewMode("sql");
          ws().openSavedQuery(q.id);
          ui().setWorkspacePage("workbench");
        },
      })),
    ];
    const snippetCommands: Command[] = snippets.flatMap((sn) => [
      {
        id: `snippet:insert:${sn.id}`,
        group: "Snippets" as const,
        label: `Insert snippet ${sn.name}`,
        detail: `${sn.folder ?? ""} ${sn.description ?? ""} ${sn.sql.slice(0, 120)}`,
        icon: "insert" as const,
        run: () => insertSnippet(sn.sql),
      },
      {
        id: `snippet:run:${sn.id}`,
        group: "Snippets" as const,
        label: `Run snippet ${sn.name}`,
        detail: `${sn.folder ?? ""} new tab`,
        icon: "play" as const,
        run: () => openSnippet(sn.sql, sn.name, true),
      },
    ]);
    const viewCommands: Command[] = views.flatMap((v) => [
      {
        id: `preview-view:${v.name}`,
        group: "Tables" as const,
        label: `Preview view ${v.name}`,
        detail: v.columns.map((c) => c.name).join(" "),
        icon: "table" as const,
        run: () => previewTable(v.name),
      },
      {
        id: `open-view:${v.name}`,
        group: "Tables" as const,
        label: `Open view ${v.name}`,
        detail: "columns details page",
        icon: "file" as const,
        run: () => openTablePage(v.name),
      },
    ]);
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
        id: `open:${t.name}`,
        group: "Tables" as const,
        label: `Open table ${t.name}`,
        detail: "columns details relationships page",
        icon: "table" as const,
        run: () => openTablePage(t.name),
      },
      {
        id: `profile:${t.name}`,
        group: "Tables" as const,
        label: `Profile ${t.name}`,
        detail: "stats nulls distinct table page",
        icon: "profile" as const,
        run: () => openTablePage(t.name, "profile"),
      },
    ]);
    // Columns: found by name (or type), insert the qualified name at the cursor.
    const columnCommands: Command[] = [...tables, ...views].flatMap((t) =>
      t.columns.map((c) => ({
        id: `column:${t.name}.${c.name}`,
        group: "Columns" as const,
        label: `${t.name}.${c.name}`,
        detail: `${c.type.toLowerCase()} column`,
        icon: "insert" as const,
        hint: c.type.toLowerCase(),
        run: () => {
          ui().setWorkspacePage("workbench");
          ws().setViewMode("sql");
          if (!insertAtCursor(quoteIdent(c.name))) ws().addTab(`SELECT ${quoteIdent(c.name)}\nFROM ${quoteIdent(t.name)}\nLIMIT 100`);
        },
      }))
    );
    const tabCommands: Command[] = tabs.map((t) => ({
      id: `tab:${t.id}`,
      group: "Tabs",
      label: `Go to ${t.title}`,
      detail: t.query.slice(0, 80),
      icon: "file",
      run: () => {
        ui().setWorkspacePage("workbench");
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
      run: () => { ui().setWorkspacePage("workbench"); ws().addTab(h.sql); },
    }));
    return [...actions, ...spaceCommands, ...libraryCommands, ...snippetCommands, ...tableCommands, ...columnCommands, ...viewCommands, ...tabCommands, ...historyCommands];
  }, [tables, views, tabs, history, spaces, spaceId, snippets, notebooks, folders, savedQueries]);

  const visible = useMemo(() => {
    // Columns and history only show up once you search, so the list starts short.
    if (!query.trim()) return commands.filter((c) => c.group !== "History" && c.group !== "Columns").slice(0, 40);
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-scrim p-3 pt-[8vh] sm:p-6 sm:pt-[10vh]"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${listId}-title`} tabIndex={-1} className="qp-pop flex max-h-[min(70dvh,640px)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-dialog">
        <h2 id={`${listId}-title`} className="sr-only">Command palette</h2>
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3">
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
                setIndex((i) => Math.min(i + 1, Math.max(visible.length - 1, 0)));
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
            placeholder="Search tables, columns, notebooks, snippets, history, or type a command"
            className="h-11 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-faint"
            aria-label="Search commands"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={visible.length ? `${listId}-option-${selected}` : undefined}
          />
        </div>
        <div ref={listRef} id={listId} role="listbox" aria-label="Commands" className="min-h-0 overflow-y-auto p-1.5">
          {visible.length === 0 && (
            <div className="px-3 py-9 text-center">
              <p className="text-[13px] font-medium text-ink">No matches found</p>
              <p className="mt-1 text-[12px] text-muted">Try a table, column, snippet, or action name.</p>
            </div>
          )}
          {visible.map((command, i) => {
            const header = command.group !== lastGroup;
            lastGroup = command.group;
            return (
              <div key={command.id}>
                {header && <SectionLabel as="div" className="px-2.5 pb-1 pt-2">{command.group}</SectionLabel>}
                <div
                  id={`${listId}-option-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === selected}
                  tabIndex={-1}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => choose(command)}
                  className={`flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] ${
                    i === selected ? "bg-accent-soft text-ink" : "text-ink hover:bg-raised"
                  }`}
                >
                  <Icon name={command.icon} className={i === selected ? "text-accent" : "text-muted"} />
                  <span className={`min-w-0 flex-1 truncate ${command.group === "History" ? "font-mono text-[12px]" : ""}`}>
                    {command.label}
                  </span>
                  {command.hint &&
                    (command.group === "Columns" ? (
                      <span className="text-[11px] text-faint">{command.hint}</span>
                    ) : (
                      <Kbd combo={command.hint} />
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
