"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { selectEngineReady, useWorkspaceStore } from "@/stores/workspace-store";
import { saveCurrentAsSnippet } from "@/stores/snippet-store";
import { useUiStore } from "@/stores/ui-store";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { registerEditor } from "@/lib/editor-bridge";
import { runActive, saveActiveQuery } from "@/lib/workspace-actions";
import { formatSql } from "./format-sql";
import { statementAt } from "@/lib/editor/statement-at";
import { defineQueryPadThemes, codeFontFamily } from "@/lib/monaco-theme";
// Importing monaco-setup also points the Monaco loader at the same-origin runtime.
import { monacoThemeName, registerSqlCompletion } from "@/lib/editor/monaco-setup";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="h-full min-h-0 overflow-hidden bg-surface p-3" role="status" aria-label="Loading SQL editor">
      <span className="sr-only">Loading SQL editor…</span>
      <div className="flex animate-pulse gap-3" aria-hidden="true">
        <div className="flex w-7 shrink-0 flex-col items-end gap-3 pt-1">
          {Array.from({ length: 8 }, (_, i) => <span key={i} className="h-2.5 w-3 rounded bg-raised" />)}
        </div>
        <div className="flex flex-1 flex-col gap-3 pt-1">
          <span className="h-2.5 w-[42%] rounded bg-raised" />
          <span className="h-2.5 w-[68%] rounded bg-raised" />
          <span className="h-2.5 w-[54%] rounded bg-raised" />
          <span className="h-2.5 w-[76%] rounded bg-raised" />
          <span className="h-2.5 w-[37%] rounded bg-raised" />
        </div>
      </div>
    </div>
  ),
});

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Close Monaco's hover card. Monaco leaves it painted when the editor loses focus mid-hover
 * (clicking Run, results, the Assistant) and the half-faded card then sits under the editor
 * line until the next mouse move, so we dismiss it on blur and before every run.
 */
function hideHover(editor: any) {
  const content = editor.getContribution?.("editor.contrib.contentHover");
  if (typeof content?.hideContentHover === "function") content.hideContentHover();
  // Older Monaco builds expose the combined controller instead.
  const legacy = editor.getContribution?.("editor.contrib.hover");
  if (typeof legacy?.hide === "function") legacy.hide();
}

export default function QueryEditor() {
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const query = useWorkspaceStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.query ?? "");
  const updateTab = useWorkspaceStore((s) => s.updateTab);
  const theme = useUiStore((s) => s.theme);
  const roomId = useCollaborationStore((s) => s.roomId);
  // State (not a ref) so the collaboration binding re-runs once the new editor mounts.
  const [editor, setEditor] = useState<any>(null);
  const monacoRef = useRef<any>(null);

  useEffect(() => {
    monacoRef.current?.editor.setTheme(monacoThemeName(theme));
  }, [theme]);

  useEffect(() => () => registerEditor(null), []);

  // Live collaboration: bind the editor model to the tab's shared Y.Text.
  useEffect(() => {
    if (!roomId) return;
    let binding: { destroy(): void } | null = null;
    let cancelled = false;
    (async () => {
      const [{ getYTextForTab, getAwareness }, { MonacoBinding }] = await Promise.all([
        import("@/lib/collaboration/sync"),
        import("y-monaco"),
      ]);
      const yText = getYTextForTab(activeTabId);
      const model = editor?.getModel();
      if (cancelled || !editor || !yText || !model) return;
      binding = new MonacoBinding(yText, model, new Set([editor]), getAwareness());
    })().catch((err) => console.error("Failed to bind editor to room:", err));
    return () => {
      cancelled = true;
      binding?.destroy();
    };
  }, [roomId, activeTabId, editor]);

  const handleMount = (mounted: any, monaco: any) => {
    const editor = mounted;
    setEditor(mounted);
    monacoRef.current = monaco;
    registerEditor(mounted);
    // Cursor position and selection size for the status bar.
    mounted.onDidChangeCursorSelection(() => {
      const sel = mounted.getSelection();
      const model = mounted.getModel();
      if (!sel || !model) return;
      useUiStore.getState().setCursor({
        line: sel.positionLineNumber,
        column: sel.positionColumn,
        selected: sel.isEmpty() ? 0 : model.getValueInRange(sel).length,
      });
    });
    monaco.editor.setTheme(monacoThemeName(useUiStore.getState().theme));
    mounted.onDidBlurEditorWidget(() => hideHover(mounted));

    // Actions read live state through stores, so they never run a stale query.
    editor.addAction({
      id: "querypad.run",
      label: "Run query (selection or all)",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => {
        hideHover(editor);
        runActive();
      },
    });
    editor.addAction({
      id: "querypad.runStatement",
      label: "Run the statement at the cursor",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter],
      run: () => {
        hideHover(editor);
        const model = editor.getModel();
        const position = editor.getPosition();
        const ws = useWorkspaceStore.getState();
        if (!model || !position || !selectEngineReady(ws)) return;
        const statement = statementAt(model.getValue(), model.getOffsetAt(position));
        if (statement) void ws.runQuery(undefined, statement);
      },
    });
    editor.addAction({
      id: "querypad.ai",
      label: "Ask AI to write SQL",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK],
      run: () => {
        const ui = useUiStore.getState();
        if (ui.aiOpen) ui.closeAi();
        else ui.openAi();
      },
    });
    editor.addAction({
      id: "querypad.save",
      label: "Save query to a folder",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => void saveActiveQuery(),
    });
    editor.addAction({
      id: "querypad.snippet",
      label: "Save as snippet (selection or query)",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS],
      run: () => void saveCurrentAsSnippet(),
    });
    editor.addAction({
      id: "querypad.format",
      label: "Format SQL (selection or query)",
      keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
      run: () => void formatSql(),
    });
    editor.addAction({
      id: "querypad.palette",
      label: "QueryPad command palette",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP],
      run: () => useUiStore.getState().setPaletteOpen(true),
    });

    // One provider shared with notebook cells (tables, columns, snippets; reads live state).
    registerSqlCompletion(monaco);
  };

  return (
    <MonacoEditor
      key={activeTabId}
      defaultLanguage="sql"
      value={query}
      onChange={(v) => updateTab(activeTabId, { query: v ?? "" })}
      beforeMount={defineQueryPadThemes}
      onMount={handleMount}
      theme={monacoThemeName(theme)}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        lineHeight: 21,
        fontFamily: codeFontFamily(),
        fontLigatures: false,
        lineNumbers: "on",
        lineNumbersMinChars: 3,
        scrollBeyondLastLine: false,
        wordWrap: "on",
        padding: { top: 10, bottom: 10 },
        renderLineHighlight: "line",
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        automaticLayout: true,
        tabSize: 2,
      }}
    />
  );
}
