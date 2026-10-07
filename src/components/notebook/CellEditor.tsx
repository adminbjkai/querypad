"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useUiStore } from "@/stores/ui-store";
import { defineQueryPadThemes, codeFontFamily } from "@/lib/monaco-theme";
import { monacoThemeName, registerSqlCompletion } from "@/lib/editor/monaco-setup";

/* eslint-disable @typescript-eslint/no-explicit-any */

const LINE_HEIGHT = 20;
const PADDING = 16;
const MIN_LINES = 3;
const MAX_LINES = 20;
const MIN_HEIGHT = MIN_LINES * LINE_HEIGHT + PADDING;
const MAX_HEIGHT = MAX_LINES * LINE_HEIGHT + PADDING;

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="bg-surface p-2" style={{ height: MIN_HEIGHT }} role="status" aria-label="Loading SQL editor">
      <span className="sr-only">Loading SQL editor…</span>
      <div className="flex animate-pulse gap-3 pt-1" aria-hidden="true">
        <span className="h-2.5 w-[42%] rounded bg-raised" />
      </div>
    </div>
  ),
});

export interface CellEditorHandlers {
  /** ⌘/Ctrl+Enter: run this cell and stay. */
  onRun: () => void;
  /** Shift+Enter: run this cell and move to the next one. */
  onRunAndAdvance: () => void;
  /** Escape (with no widget open): hand focus back to the cell. */
  onEscape: () => void;
}

/**
 * A compact SQL editor for one notebook cell: the workbench's language, completion and themes,
 * sized to its content (3–20 lines) so the page, not the editor, scrolls.
 */
export default function CellEditor({
  value,
  onChange,
  label,
  autoFocus = false,
  handlers,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  autoFocus?: boolean;
  handlers: CellEditorHandlers;
}) {
  const theme = useUiStore((s) => s.theme);
  const [height, setHeight] = useState(MIN_HEIGHT);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);
  const monacoRef = useRef<any>(null);

  useEffect(() => {
    monacoRef.current?.editor.setTheme(monacoThemeName(theme));
  }, [theme]);

  const handleMount = (editor: any, monaco: any) => {
    monacoRef.current = monaco;
    registerSqlCompletion(monaco);
    monaco.editor.setTheme(monacoThemeName(useUiStore.getState().theme));

    const fit = () => {
      // Content height already includes the editor's own top/bottom padding.
      setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, editor.getContentHeight())));
    };
    editor.onDidContentSizeChange(fit);
    fit();

    editor.addAction({
      id: "querypad.cell.run",
      label: "Run cell",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => handlersRef.current.onRun(),
    });
    editor.addAction({
      id: "querypad.cell.runAdvance",
      label: "Run cell and move to the next",
      keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.Enter],
      run: () => handlersRef.current.onRunAndAdvance(),
    });
    editor.addAction({
      id: "querypad.cell.escape",
      label: "Focus the cell",
      keybindings: [monaco.KeyCode.Escape],
      precondition: "!suggestWidgetVisible && !findWidgetVisible && !parameterHintsVisible && !renameInputVisible",
      run: () => handlersRef.current.onEscape(),
    });
    if (autoFocus) editor.focus();
  };

  return (
    <div className="overflow-hidden bg-surface" style={{ height }} role="group" aria-label={label}>
      <MonacoEditor
        height={height}
        defaultLanguage="sql"
        value={value}
        onChange={(v) => onChange(v ?? "")}
        beforeMount={defineQueryPadThemes}
        onMount={handleMount}
        theme={monacoThemeName(theme)}
        options={{
          minimap: { enabled: false },
          fontSize: 12,
          lineHeight: LINE_HEIGHT,
          fontFamily: codeFontFamily(),
          fontLigatures: false,
          lineNumbers: "on",
          lineNumbersMinChars: 2,
          glyphMargin: false,
          folding: false,
          scrollBeyondLastLine: false,
          wordWrap: "on",
          padding: { top: 8, bottom: 8 },
          renderLineHighlight: "none",
          overviewRulerLanes: 0,
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, alwaysConsumeMouseWheel: false },
          automaticLayout: true,
          tabSize: 2,
        }}
      />
    </div>
  );
}
