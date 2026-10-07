import { create } from "zustand";
import { readPreference, writePreference } from "@/lib/preferences";

export type Theme = "light" | "dark";
export type SidebarPanel = "tables" | "joins" | "history" | "snippets";
/**
 * Home is the AI-first start page; the workbench holds SQL tabs and pipelines; `table` is one
 * dataset's page; `tables` is the catalog; `agent`, `notebooks` (list or one notebook) and
 * `folders` (list or one folder) are the remaining rail pages.
 */
export type WorkspacePage = "home" | "workbench" | "table" | "tables" | "agent" | "notebooks" | "folders";
/** Pages that keep the side panel (Tables, Joins …) available next to them. */
export const PANEL_PAGES: ReadonlySet<WorkspacePage> = new Set<WorkspacePage>(["workbench", "notebooks"]);
export type TablePageTab = "overview" | "preview" | "profile";
export type Dialog = "addFiles" | "collaborate" | "plugins" | "shortcuts" | "clearSpace" | null;

export interface Toast {
  id: number;
  tone: "info" | "success" | "warning" | "error";
  message: string;
}

interface UiState {
  /** Navigation is a UI preference, never part of another device's saved space. */
  workspacePage: WorkspacePage;
  setWorkspacePage: (page: WorkspacePage) => void;
  /** The dataset shown by the `table` page, and which of its tabs is open (session state only). */
  tablePage: string | null;
  tablePageTab: TablePageTab;
  openTablePage: (name: string, tab?: TablePageTab) => void;
  setTablePageTab: (tab: TablePageTab) => void;
  /** The notebook open on the `notebooks` page (null = the list); `openNotebook` shows the page. */
  notebookId: string | null;
  openNotebook: (id: string | null) => void;
  /** The folder open on the `folders` page (null = the top level); `openFolder` shows the page. */
  folderId: string | null;
  openFolder: (id: string | null) => void;
  /** Spaces whose "sample data" banner was dismissed (remembered). */
  dismissedSampleHints: string[];
  dismissSampleHint: (spaceId: string) => void;
  /** The left navigation shows icons only (remembered). */
  navCollapsed: boolean;
  setNavCollapsed: (collapsed: boolean) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;

  sidebarOpen: boolean;
  sidebarPanel: SidebarPanel;
  setSidebarOpen: (open: boolean) => void;
  showPanel: (panel: SidebarPanel) => void;
  /** Open a panel, or close it when it is already the open one. */
  togglePanel: (panel: SidebarPanel) => void;
  /** Show or hide the side panel (from a page without one, this opens the workbench with it shown). */
  toggleSidePanel: () => void;

  profileTable: string | null;
  setProfileTable: (name: string | null) => void;

  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;

  spaceMenuOpen: boolean;
  setSpaceMenuOpen: (open: boolean) => void;

  /** AI bar above the editor; `aiSeed` pre-fills its prompt (e.g. "fix this error"). */
  aiOpen: boolean;
  aiSeed: string | null;
  openAi: (seed?: string) => void;
  closeAi: () => void;

  dialog: Dialog;
  setDialog: (dialog: Dialog) => void;

  /** The side Assistant chat panel (remembered across reloads). */
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
  /** Editor cursor for the status bar: line, column and selected characters. */
  cursor: { line: number; column: number; selected: number } | null;
  setCursor: (cursor: { line: number; column: number; selected: number } | null) => void;
  /** Width of the Assistant panel in px (drag its left edge; remembered). */
  assistantWidth: number;
  setAssistantWidth: (width: number) => void;

  /** Editor share of the vertical split, 0.15–0.85. */
  editorFraction: number;
  setEditorFraction: (fraction: number) => void;

  toasts: Toast[];
  toast: (message: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
}

const THEME_KEY = "querypad:theme";
const SPLIT_KEY = "querypad:split";
const NAV_KEY = "querypad:nav-collapsed";
const ASSISTANT_KEY = "querypad:assistant-open";
const ASSISTANT_WIDTH_KEY = "querypad:assistant-width";
const SAMPLE_HINT_KEY = "querypad:sample-hint-dismissed";

function initialDismissedSampleHints(): string[] {
  try {
    const parsed: unknown = JSON.parse(readPreference(SAMPLE_HINT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function initialAssistantWidth(): number {
  if (typeof window === "undefined") return 400;
  const saved = Number(readPreference(ASSISTANT_WIDTH_KEY));
  return saved >= 300 && saved <= 760 ? saved : 400;
}

function initialTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function initialSplit(): number {
  if (typeof window === "undefined") return 0.45;
  const saved = Number(readPreference(SPLIT_KEY));
  return saved >= 0.15 && saved <= 0.85 ? saved : 0.45;
}

let toastSeq = 0;
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();
const TOAST_MS = 4000;
const TOAST_ERROR_MS = 8000;
const MAX_TOASTS = 3;

export const useUiStore = create<UiState>((set, get) => ({
  workspacePage: "workbench",
  // Leaving a page also closes the Explorer's quick profile view.
  setWorkspacePage: (workspacePage) => set((s) => (s.workspacePage === workspacePage ? {} : { workspacePage, profileTable: null })),
  tablePage: null,
  tablePageTab: "overview",
  openTablePage: (name, tab = "overview") => set({ workspacePage: "table", tablePage: name, tablePageTab: tab, profileTable: null }),
  setTablePageTab: (tablePageTab) => set({ tablePageTab }),
  notebookId: null,
  openNotebook: (notebookId) => set({ workspacePage: "notebooks", notebookId, profileTable: null }),
  folderId: null,
  openFolder: (folderId) => set({ workspacePage: "folders", folderId, profileTable: null }),
  dismissedSampleHints: initialDismissedSampleHints(),
  dismissSampleHint: (spaceId) => {
    const dismissedSampleHints = [...new Set([...get().dismissedSampleHints, spaceId])].slice(-50);
    writePreference(SAMPLE_HINT_KEY, JSON.stringify(dismissedSampleHints));
    set({ dismissedSampleHints });
  },
  navCollapsed: readPreference(NAV_KEY) === "1",
  setNavCollapsed: (navCollapsed) => {
    writePreference(NAV_KEY, navCollapsed ? "1" : "0");
    set({ navCollapsed });
  },
  theme: initialTheme(),
  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme;
    writePreference(THEME_KEY, theme);
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),

  // Phones start with the sidebar closed so the editor is visible.
  sidebarOpen: typeof window === "undefined" || window.innerWidth >= 768,
  sidebarPanel: "tables",
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  // The quick profile view belongs to the Tables panel; showing another panel closes it.
  showPanel: (sidebarPanel) => set((s) => ({ sidebarPanel, sidebarOpen: true, profileTable: sidebarPanel === "tables" ? s.profileTable : null })),
  toggleSidePanel: () =>
    set((s) => (PANEL_PAGES.has(s.workspacePage) ? { sidebarOpen: !s.sidebarOpen } : { workspacePage: "workbench", sidebarOpen: true })),
  togglePanel: (panel) =>
    set((s) =>
      s.sidebarOpen && s.sidebarPanel === panel
        ? { sidebarOpen: false }
        : { sidebarPanel: panel, sidebarOpen: true, profileTable: panel === "tables" ? s.profileTable : null }
    ),

  profileTable: null,
  setProfileTable: (profileTable) => set({ profileTable }),

  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),

  spaceMenuOpen: false,
  setSpaceMenuOpen: (spaceMenuOpen) => set({ spaceMenuOpen }),

  aiOpen: false,
  aiSeed: null,
  openAi: (seed) => set({ aiOpen: true, aiSeed: seed ?? null, workspacePage: "workbench" }),
  closeAi: () => set({ aiOpen: false, aiSeed: null }),

  dialog: null,
  setDialog: (dialog) => set({ dialog }),

  assistantOpen: typeof window !== "undefined" && readPreference(ASSISTANT_KEY) === "1" && window.innerWidth >= 1024,
  setAssistantOpen: (assistantOpen) => {
    writePreference(ASSISTANT_KEY, assistantOpen ? "1" : "0");
    set({ assistantOpen });
  },
  cursor: null,
  setCursor: (cursor) => set({ cursor }),
  assistantWidth: initialAssistantWidth(),
  setAssistantWidth: (assistantWidth) => {
    writePreference(ASSISTANT_WIDTH_KEY, String(Math.round(assistantWidth)));
    set({ assistantWidth });
  },

  editorFraction: initialSplit(),
  setEditorFraction: (fraction) => {
    const clamped = Math.min(0.85, Math.max(0.15, fraction));
    writePreference(SPLIT_KEY, clamped.toFixed(3));
    set({ editorFraction: clamped });
  },

  toasts: [],
  // Same message again bumps the existing toast's timer instead of stacking a duplicate; at most 3 show.
  toast: (message, tone = "info") => {
    const existing = get().toasts.find((t) => t.message === message);
    const id = existing?.id ?? ++toastSeq;
    if (existing) {
      clearTimeout(toastTimers.get(id));
      if (existing.tone !== tone) set((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, tone } : t)) }));
    } else {
      set((s) => {
        const dropped = s.toasts.slice(0, Math.max(0, s.toasts.length - (MAX_TOASTS - 1)));
        dropped.forEach((t) => clearTimeout(toastTimers.get(t.id)));
        return { toasts: [...s.toasts.slice(-(MAX_TOASTS - 1)), { id, tone, message }] };
      });
    }
    toastTimers.set(id, setTimeout(() => get().dismissToast(id), tone === "error" ? TOAST_ERROR_MS : TOAST_MS));
  },
  dismissToast: (id) => {
    clearTimeout(toastTimers.get(id));
    toastTimers.delete(id);
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/** Shorthand for non-React callers. */
export const toast = (message: string, tone?: Toast["tone"]) =>
  useUiStore.getState().toast(message, tone);
