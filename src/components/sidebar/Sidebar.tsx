"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { EXPLORER_DEFAULT, EXPLORER_MAX, EXPLORER_MIN, toast, useUiStore, type SidebarPanel } from "@/stores/ui-store";
import type { TableInfo } from "@/types";
import { relationshipKey } from "@/lib/discovery/relationships";
import { readPreference, writePreference } from "@/lib/preferences";
import { askAssistant } from "@/components/home/Composer";
import ExplorerTree from "./ExplorerTree";
import ObjectDetails from "./ObjectDetails";
import ProfileDrawer from "./ProfileDrawer";
import RelationshipsPanel from "./RelationshipsPanel";
import HistoryPanel from "./HistoryPanel";
import SnippetsPanel from "./SnippetsPanel";
import PanelHeader, { SearchBox } from "./PanelHeader";
import { firstSeen } from "./TableHoverCard";
import { Icon } from "@/components/ui/icons";
import { Chip, Menu, MOD, Segmented, Spinner, btn } from "@/components/ui/primitives";
import { formatBytes } from "@/lib/utils";

const PANEL_LABEL: Record<SidebarPanel, string> = { tables: "Tables", joins: "Joins", history: "History", snippets: "Snippets" };

type FilterKey = "tables" | "views" | "joins" | "profiled";
const FILTER_LABEL: Record<FilterKey, string> = { tables: "Tables", views: "Views", joins: "With joins", profiled: "Profiled" };
const FILTER_KEYS = Object.keys(FILTER_LABEL) as FilterKey[];

/** Collapsed explorer nodes ("root", "group:tables", "group:views"), remembered per space in this browser. */
const collapsedKey = (spaceId: string | null) => `querypad-explorer-collapsed:${spaceId ?? "default"}`;
function readCollapsed(spaceId: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(readPreference(collapsedKey(spaceId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

const SPLIT_KEY = "querypad-explorer-split";
const SPLIT_MIN = 0.2;
const SPLIT_MAX = 0.7;
const clampSplit = (v: number) => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, v));

/** Pinned table names, remembered per space in this browser. */
const pinsKey = (spaceId: string | null) => `querypad-pins:${spaceId ?? "default"}`;
function readPins(spaceId: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(readPreference(pinsKey(spaceId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** The seam between the explorer and the editor. It sits above the editor, like the assistant's handle. */
function ExplorerEdge({ onDragging }: { onDragging: (dragging: boolean) => void }) {
  const dragCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => dragCleanup.current?.(), []);

  const startDrag = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragCleanup.current?.();
    const startX = e.clientX;
    const startWidth = useUiStore.getState().explorerWidth;
    onDragging(true);
    const move = (ev: PointerEvent) => {
      const next = startWidth + (ev.clientX - startX);
      useUiStore.getState().setExplorerWidth(next);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      dragCleanup.current = null;
      onDragging(false);
    };
    dragCleanup.current = end;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const nudge = (next: number) => {
    const ui = useUiStore.getState();
    if (next < EXPLORER_MIN) ui.setSidebarOpen(false);
    else ui.setExplorerWidth(next);
  };

  return (
    <div className="group/edge pointer-events-none absolute inset-y-0 right-0 z-30 w-3 max-md:hidden">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize explorer"
        aria-controls="querypad-explorer"
        aria-valuemin={EXPLORER_MIN}
        aria-valuemax={EXPLORER_MAX}
        aria-valuenow={useUiStore.getState().explorerWidth}
        aria-valuetext={`Explorer ${useUiStore.getState().explorerWidth} pixels wide`}
        title="Drag to resize · double-click to reset"
        tabIndex={0}
        onPointerDown={startDrag}
        onDoubleClick={() => useUiStore.getState().setExplorerWidth(EXPLORER_DEFAULT)}
        onKeyDown={(e) => {
          const current = useUiStore.getState().explorerWidth;
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            nudge(current - 16);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            nudge(current + 16);
          } else if (e.key === "Home") {
            e.preventDefault();
            nudge(EXPLORER_MIN);
          } else if (e.key === "End") {
            e.preventDefault();
            nudge(EXPLORER_MAX);
          }
        }}
        className="pointer-events-auto absolute inset-y-0 -right-1.5 z-30 hidden w-3 cursor-col-resize touch-none outline-none md:block"
      >
        <span className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-line-strong transition-colors group-hover/edge:bg-accent group-focus-within/edge:bg-accent" />
      </div>
      <button
        type="button"
        onClick={() => useUiStore.getState().setSidebarOpen(false)}
        className="pointer-events-auto absolute right-1 top-[calc(50%+28px)] flex size-5 items-center justify-center rounded-full border border-line bg-surface text-muted opacity-0 shadow-sm transition-[opacity,color,background-color] hover:text-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent group-hover/edge:opacity-100"
        aria-label="Collapse explorer"
        title={`Collapse explorer (${MOD}+B)`}
      >
        <Icon name="chevronRight" size={12} className="rotate-180" />
      </button>
    </div>
  );
}

export default function Sidebar() {
  const tables = useWorkspaceStore((s) => s.tables);
  const views = useWorkspaceStore((s) => s.views);
  const schemaContext = useUiStore((s) => s.schemaContext);
  const spaceId = useWorkspaceStore((s) => s.spaceId);
  const spaceName = useWorkspaceStore((s) => s.spaces.find((sp) => sp.id === s.spaceId)?.name) ?? "Workspace";
  const fileEntries = useWorkspaceStore((s) => s.fileEntries);
  const unrestoredFiles = useWorkspaceStore((s) => s.unrestoredFiles);
  const tableProfiles = useWorkspaceStore((s) => s.tableProfiles);
  const syncCatalog = useWorkspaceStore((s) => s.syncCatalog);
  const loadTableProfile = useWorkspaceStore((s) => s.loadTableProfile);
  const discovery = useWorkspaceStore((s) => s.discovery);
  const verdicts = useWorkspaceStore((s) => s.relationshipVerdicts);
  const open = useUiStore((s) => s.sidebarOpen);
  const explorerWidth = useUiStore((s) => s.explorerWidth);
  const panel = useUiStore((s) => s.sidebarPanel);
  const setOpen = useUiStore((s) => s.setSidebarOpen);
  const [dragging, setDragging] = useState(false);
  // Stay mounted through the close animation so the width can ease shut. Phones skip it.
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => setExpanded(true));
      return () => cancelAnimationFrame(frame);
    }
    setExpanded(false);
    const instant = window.matchMedia("(max-width: 767px), (prefers-reduced-motion: reduce)").matches;
    if (instant) {
      setMounted(false);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), 260);
    return () => window.clearTimeout(timer);
  }, [open]);
  const setDialog = useUiStore((s) => s.setDialog);
  const profileTable = useUiStore((s) => s.profileTable);
  const setProfileTable = useUiStore((s) => s.setProfileTable);

  // Columns that take part in a (non-rejected) join, so the tree can mark keys.
  const keyColumns = useMemo(() => {
    const marks = new Map<string, "key" | "ref">();
    for (const rel of discovery.relationships) {
      if (verdicts[relationshipKey(rel)] === "rejected") continue;
      marks.set(`${rel.to.table}.${rel.to.column}`, "key");
      if (!marks.has(`${rel.from.table}.${rel.from.column}`)) marks.set(`${rel.from.table}.${rel.from.column}`, "ref");
    }
    return marks;
  }, [discovery.relationships, verdicts]);

  // Remember when each table first appeared, for the hover card's "Loaded" line.
  useEffect(() => {
    const now = Date.now();
    for (const t of tables) {
      const key = `${spaceId}:${t.name}`;
      if (!firstSeen.has(key)) firstSeen.set(key, now);
    }
  }, [spaceId, tables]);

  // Pins and collapsed groups are per space: re-read them when the space changes (state adjusted during render, not in an effect).
  const [pinState, setPinState] = useState(() => ({ spaceId, pins: readPins(spaceId) }));
  if (pinState.spaceId !== spaceId) setPinState({ spaceId, pins: readPins(spaceId) });
  const pins = pinState.pins;
  const togglePin = useCallback(
    (name: string) => {
      setPinState((current) => {
        const next = current.pins.includes(name) ? current.pins.filter((n) => n !== name) : [...current.pins, name];
        writePreference(pinsKey(current.spaceId), JSON.stringify(next));
        return { ...current, pins: next };
      });
    },
    []
  );
  const [collapseState, setCollapseState] = useState(() => ({ spaceId, ids: readCollapsed(spaceId) }));
  if (collapseState.spaceId !== spaceId) setCollapseState({ spaceId, ids: readCollapsed(spaceId) });
  const collapsed = useMemo(() => new Set(collapseState.ids), [collapseState.ids]);
  const setCollapsed = useCallback((update: (ids: string[]) => string[]) => {
    setCollapseState((current) => {
      const ids = update(current.ids);
      writePreference(collapsedKey(current.spaceId), JSON.stringify(ids));
      return { ...current, ids };
    });
  }, []);
  const toggleNode = useCallback((id: string) => setCollapsed((ids) => (ids.includes(id) ? ids.filter((n) => n !== id) : [...ids, id])), [setCollapsed]);

  const [view, setView] = useState<"objects" | "sources">("objects");
  const [filter, setFilter] = useState("");
  const [kinds, setKinds] = useState<FilterKey[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const q = filter.trim().toLowerCase();
  const inSchema = useCallback(
    (t: TableInfo) => {
      const currentDb = schemaContext?.db && schemaContext.db !== "…" ? schemaContext.db : "memory";
      const currentSchema = schemaContext?.schema || "main";
      const tableDb = t.database ?? "memory";
      const tableSchema = t.schema ?? "main";
      return tableDb === currentDb && tableSchema === currentSchema;
    },
    [schemaContext]
  );
  const scopedTables = useMemo(() => tables.filter(inSchema), [tables, inSchema]);
  const scopedViews = useMemo(() => views.filter(inSchema), [views, inSchema]);

  const passes = useCallback(
    (t: TableInfo, isView: boolean) => {
      if (!inSchema(t)) return false;
      if (!(!q || t.name.toLowerCase().includes(q) || t.columns.some((c) => c.name.toLowerCase().includes(q)))) return false;
      const typeKinds = kinds.filter((k) => k === "tables" || k === "views");
      if (typeKinds.length > 0 && !typeKinds.includes(isView ? "views" : "tables")) return false;
      if (kinds.includes("joins") && !t.columns.some((c) => keyColumns.has(`${t.name}.${c.name}`))) return false;
      if (kinds.includes("profiled") && (isView || tableProfiles[t.name]?.status !== "ready")) return false;
      return true;
    },
    [q, kinds, keyColumns, tableProfiles, inSchema]
  );
  const visibleTables = useMemo(() => {
    const shown = tables.filter((t) => passes(t, false));
    return [...shown.filter((t) => pins.includes(t.name)), ...shown.filter((t) => !pins.includes(t.name))];
  }, [tables, passes, pins]);
  const visibleViews = useMemo(() => views.filter((t) => passes(t, true)), [views, passes]);

  const visibleProfile = profileTable && tables.some((t) => t.name === profileTable) ? profileTable : null;

  // Details pane: the selected object, and the share of the panel body it takes (draggable, remembered).
  const selectedView = selected ? views.find((v) => v.name === selected) : undefined;
  const selectedObject = selected ? (tables.find((t) => t.name === selected) ?? selectedView) : undefined;
  const [split, setSplit] = useState(() => {
    const stored = Number(readPreference(SPLIT_KEY));
    return stored > 0 ? clampSplit(stored) : 0.45;
  });
  const bodyRef = useRef<HTMLDivElement>(null);
  const applySplit = (value: number) => {
    const next = clampSplit(value);
    setSplit(next);
    writePreference(SPLIT_KEY, String(next));
  };
  const onDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1 || !bodyRef.current) return;
    const rect = bodyRef.current.getBoundingClientRect();
    setSplit(clampSplit((rect.bottom - e.clientY) / rect.height));
  };
  const onSplitKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.05;
    if (e.key === "ArrowUp") applySplit(split + step);
    else if (e.key === "ArrowDown") applySplit(split - step);
    else if (e.key === "Home") applySplit(SPLIT_MAX);
    else if (e.key === "End") applySplit(SPLIT_MIN);
    else return;
    e.preventDefault();
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await syncCatalog(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not refresh the tables.", "error");
    } finally {
      setRefreshing(false);
    }
  };
  const profileAll = async () => {
    if (tables.length === 0) return;
    toast(`Profiling ${tables.length} ${tables.length === 1 ? "table" : "tables"}…`, "info");
    for (const t of tables) await loadTableProfile(t.name);
    toast("Profiled all tables.", "success");
  };
  const toggleKind = (kind: FilterKey) => setKinds((current) => (current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]));

  const frameWidth = expanded ? explorerWidth : 0;

  if (!mounted) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Show explorer"
        title={`Show explorer (${MOD}+B)`}
        className="hidden h-full w-10 shrink-0 flex-col items-center gap-2 border-r border-line bg-chrome py-3 text-faint transition-colors hover:bg-sunken hover:text-ink focus-visible:text-ink md:flex"
      >
        <Icon name="chevronRight" size={14} className="text-accent" />
        <span className="text-[12px] font-medium [writing-mode:vertical-rl]">{PANEL_LABEL[panel]}</span>
      </button>
    );
  }

  const total = scopedTables.length + scopedViews.length;
  const filtering = q !== "" || kinds.length > 0;
  const nothingShown = visibleTables.length === 0 && visibleViews.length === 0;

  return (
    <>
      {/* Small screens: the panel floats over the work area, beside the icon rail. */}
      <div className="fixed inset-0 left-[52px] z-30 bg-scrim md:hidden" onClick={() => setOpen(false)} />
      <div className="fixed bottom-6 left-[52px] top-0 z-30 flex md:static md:z-20 md:h-full">
        <div
          className="qp-explorer-frame relative h-full min-w-0 max-md:!w-[min(100vw-52px,20rem)]"
          style={{ width: frameWidth }}
          data-dragging={dragging ? "true" : "false"}
        >
        <aside
          id="querypad-explorer"
          className="qp-slide-in flex h-full w-full min-w-0 flex-col overflow-hidden border-r border-line bg-chrome"
          aria-label={`${PANEL_LABEL[panel]} panel`}
        >
          <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-chrome">
            {panel === "tables" && (
              <div className="flex min-h-0 flex-1 flex-col">
                <PanelHeader
                  title="Tables"
                  count={total > 0 ? (views.length > 0 ? `${total} objects` : `${tables.length} ${tables.length === 1 ? "table" : "tables"}`) : undefined}
                >
                  <button onClick={() => void refresh()} disabled={refreshing} className={btn.icon} title="Refresh from the database" aria-label="Refresh tables">
                    {refreshing ? <Spinner className="size-3.5" /> : <Icon name="refresh" size={16} />}
                  </button>
                  {/* The empty state carries the primary "Add data" action, so the header keeps one accessible name per page. */}
                  {total > 0 && (
                    <button onClick={() => setDialog("addFiles")} className={btn.icon} title="Add data" aria-label="Add data">
                      <Icon name="plus" size={16} />
                    </button>
                  )}
                  <Menu
                    label="Tables actions"
                    items={[
                      { label: "Add data…", icon: "upload", onSelect: () => setDialog("addFiles") },
                      "divider",
                      { label: "Expand all", onSelect: () => setCollapsed(() => []) },
                      { label: "Collapse all", onSelect: () => setCollapsed(() => ["group:tables", "group:views"]) },
                      "divider",
                      { label: "Profile all", icon: "profile", disabled: tables.length === 0, onSelect: () => void profileAll() },
                    ]}
                    trigger={({ toggle }) => (
                      <button onClick={toggle} className={btn.icon} aria-haspopup="menu" aria-label="Tables actions" title="More actions">
                        <Icon name="more" size={16} />
                      </button>
                    )}
                  />
                </PanelHeader>
                <div className="shrink-0 px-3 pt-2.5">
                  <Segmented
                    ariaLabel="Explorer view"
                    value={view}
                    onChange={setView}
                    options={[
                      { value: "objects", label: "Objects" },
                      { value: "sources", label: "Sources", title: "Files behind your tables" },
                    ]}
                  />
                </div>
                {view === "objects" ? (
                  <>
                    <SearchBox value={filter} onChange={setFilter} placeholder="Search tables and columns" label="Search tables and columns" />
                    <div className="flex shrink-0 flex-wrap items-center gap-1 px-3 pb-2">
                      <Menu
                        label="Filter objects"
                        align="left"
                        items={FILTER_KEYS.map((k) => ({ label: FILTER_LABEL[k], checked: kinds.includes(k), onSelect: () => toggleKind(k) }))}
                        trigger={({ open: menuOpen, toggle }) => (
                          <button onClick={toggle} aria-haspopup="menu" aria-expanded={menuOpen} className={`${btn.ghost} -ml-1 gap-1.5`}>
                            <Icon name="filter" size={14} />
                            Filter
                            <Icon name="chevronDown" size={14} className="text-faint" />
                          </button>
                        )}
                      />
                      {kinds.map((k) => (
                        <Chip key={k} tone="accent" className="gap-1 pr-0.5">
                          {FILTER_LABEL[k]}
                          <button onClick={() => toggleKind(k)} className="inline-flex size-4 items-center justify-center rounded hover:bg-accent/10" aria-label={`Remove filter ${FILTER_LABEL[k]}`}>
                            <Icon name="x" size={12} />
                          </button>
                        </Chip>
                      ))}
                    </div>
                    <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col border-t border-line">
                      <div className="min-h-0 flex-1 overflow-y-auto pt-1.5">
                        {total === 0 ? (
                          <div className="flex flex-col items-center px-4 py-10 text-center">
                            <span className="flex size-9 items-center justify-center rounded-lg bg-raised text-muted">
                              <Icon name="table" size={18} />
                            </span>
                            <p className="mt-3 text-[14px] font-medium text-ink">No tables yet</p>
                            <p className="mt-1 text-[13px] leading-5 text-muted">
                              {schemaContext.db === "memory" && schemaContext.schema === "main" ? (
                                <>Add files or create one with <code className="font-mono text-[12px]">CREATE TABLE</code>.</>
                              ) : (
                                <>
                                  Nothing in <span className="font-mono text-ink">{schemaContext.db}.{schemaContext.schema}</span> yet.
                                  Create a table here, or switch schema from the SQL worksheet.
                                </>
                              )}
                            </p>
                            <button onClick={() => setDialog("addFiles")} className={`${btn.primary} mt-4`}>
                              <Icon name="upload" size={16} />
                              Add data
                            </button>
                          </div>
                        ) : (
                          <ExplorerTree
                            spaceName={spaceName}
                            tables={visibleTables}
                            views={visibleViews}
                            totalTables={tables.length}
                            totalViews={views.length}
                            query={q}
                            keyColumns={keyColumns}
                            pins={pins}
                            collapsed={collapsed}
                            onToggleNode={toggleNode}
                            selected={selectedObject ? selectedObject.name : null}
                            profileTable={visibleProfile}
                            onSelect={setSelected}
                            onProfile={(name) => setProfileTable(visibleProfile === name ? null : name)}
                            onTogglePin={togglePin}
                          />
                        )}
                        {filtering && total > 0 && nothingShown && (
                          <p className="px-3 pb-3 text-[13px] text-muted">{q ? <>Nothing matches “{filter.trim()}”.</> : "Nothing matches these filters."}</p>
                        )}
                        {q && total > 0 && (
                          <div className="mt-1 border-t border-line px-1.5 pb-2 pt-2">
                            <button
                              onClick={() => askAssistant(`Which of my tables and columns relate to "${filter.trim()}", and how are they connected?`)}
                              className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left text-[12px] text-muted transition-colors hover:bg-sunken hover:text-ink"
                            >
                              <Icon name="sparkle" size={14} className="shrink-0 text-accent" />
                              <span className="truncate">
                                Ask the Assistant about <span className="font-mono text-ink">{filter.trim()}</span>
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                      {selectedObject && (
                        <>
                          <div
                            role="separator"
                            aria-orientation="horizontal"
                            aria-label="Resize details"
                            aria-valuemin={SPLIT_MIN * 100}
                            aria-valuemax={SPLIT_MAX * 100}
                            aria-valuenow={Math.round(split * 100)}
                            tabIndex={0}
                            onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
                            onPointerMove={onDrag}
                            onPointerUp={() => applySplit(split)}
                            onKeyDown={onSplitKey}
                            className="group relative z-10 -my-[3px] h-[7px] shrink-0 cursor-row-resize touch-none focus-visible:outline-none"
                          >
                            <span className="absolute inset-x-0 top-[3px] h-px bg-line transition-colors group-hover:bg-accent group-focus-visible:h-0.5 group-focus-visible:bg-accent" />
                          </div>
                          <div className="flex min-h-0 shrink-0 flex-col border-line" style={{ height: `${split * 100}%` }}>
                            <ObjectDetails
                              table={selectedObject}
                              isView={!!selectedView}
                              keyColumns={keyColumns}
                              onProfile={() => setProfileTable(selectedObject.name)}
                              onClose={() => setSelected(null)}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto pb-3 pt-2.5">
                    <div className="px-3 pb-2">
                      <button onClick={() => setDialog("addFiles")} className={`${btn.secondary} w-full`}>
                        <Icon name="upload" size={16} />
                        Add data
                      </button>
                    </div>
                    {fileEntries.length === 0 && unrestoredFiles.length === 0 && (
                      <p className="px-3 py-3 text-[13px] leading-5 text-muted">No files loaded. Tables created with SQL have no source file.</p>
                    )}
                    <ul>
                      {fileEntries.map((f) => (
                        <li key={f.name} className="mx-1.5 rounded-md px-1.5 py-1.5 hover:bg-sunken">
                          <div className="flex items-center gap-1.5">
                            <Icon name="file" size={14} className="shrink-0 text-muted" />
                            <span className="min-w-0 truncate font-mono text-[12px] font-medium text-ink" title={f.fileName}>{f.fileName}</span>
                            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-faint">{formatBytes(f.data.byteLength)}</span>
                          </div>
                          <p className="mt-0.5 flex items-center gap-1 pl-[22px] text-[11px] text-faint">
                            becomes table <span className="truncate font-mono text-muted">{f.name}</span>
                          </p>
                        </li>
                      ))}
                      {unrestoredFiles.map((f) => (
                        <li key={`unrestored:${f.name}`} className="mx-1.5 rounded-md px-1.5 py-1.5 hover:bg-sunken">
                          <div className="flex items-center gap-1.5">
                            <Icon name="file" size={14} className="shrink-0 text-muted" />
                            <span className="min-w-0 truncate font-mono text-[12px] font-medium text-ink" title={f.fileName}>{f.fileName}</span>
                            <Chip tone="warn" className="ml-auto">not restored</Chip>
                          </div>
                          <p className="mt-0.5 flex items-center gap-1 pl-[22px] text-[11px] text-faint">
                            was table <span className="truncate font-mono text-muted">{f.name}</span> — add the file again
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {panel === "joins" && <RelationshipsPanel />}
            {panel === "history" && <HistoryPanel />}
            {panel === "snippets" && <SnippetsPanel />}
          </div>
        </aside>
        <ExplorerEdge onDragging={setDragging} />
        </div>
        {visibleProfile && <ProfileDrawer tableName={visibleProfile} onClose={() => setProfileTable(null)} />}
      </div>
    </>
  );
}
