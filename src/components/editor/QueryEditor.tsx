"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { registerEditor } from "@/lib/editor-bridge";
import { runActive } from "@/lib/workspace-actions";
import { defineQueryPadThemes, codeFontFamily } from "@/lib/monaco-theme";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="h-full bg-surface" />,
});

// Completion provider is registered once per page; it always reads current tables.
let completionRegistered = false;

/* eslint-disable @typescript-eslint/no-explicit-any */
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
    monacoRef.current?.editor.setTheme(theme === "dark" ? "qp-dark" : "qp-light");
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
    monaco.editor.setTheme(useUiStore.getState().theme === "dark" ? "qp-dark" : "qp-light");

    // Actions read live state through stores, so they never run a stale query.
    editor.addAction({
      id: "querypad.run",
      label: "Run query (selection or all)",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => runActive(),
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
      id: "querypad.palette",
      label: "QueryPad command palette",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP],
      run: () => useUiStore.getState().setPaletteOpen(true),
    });

    if (!completionRegistered) {
      completionRegistered = true;
      monaco.languages.registerCompletionItemProvider("sql", {
        provideCompletionItems: (model: any, position: any) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };
          const { tables } = useWorkspaceStore.getState();
          const seen = new Set<string>();
          const suggestions: any[] = [];
          for (const t of tables) {
            suggestions.push({
              label: t.name,
              kind: monaco.languages.CompletionItemKind.Struct,
              insertText: t.name,
              detail: `table, ${t.rowCount.toLocaleString()} rows`,
              range,
            });
            for (const c of t.columns) {
              const key = `${c.name}|${c.type}`;
              if (seen.has(key)) continue;
              seen.add(key);
              suggestions.push({
                label: c.name,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: c.name,
                detail: `${c.type.toLowerCase()} in ${t.name}`,
                range,
              });
            }
          }
          return { suggestions };
        },
      });
    }
  };

  return (
    <MonacoEditor
      key={activeTabId}
      defaultLanguage="sql"
      value={query}
      onChange={(v) => updateTab(activeTabId, { query: v ?? "" })}
      beforeMount={defineQueryPadThemes}
      onMount={handleMount}
      theme={theme === "dark" ? "qp-dark" : "qp-light"}
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
