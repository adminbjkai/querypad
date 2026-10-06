/** Monaco themes derived from the app tokens (Monaco needs literal hex colors). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineQueryPadThemes(monaco: any): void {
  monaco.editor.defineTheme("qp-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "1d5fdb", fontStyle: "bold" },
      { token: "operator.sql", foreground: "4f5b6c" },
      { token: "string", foreground: "c2410c" },
      { token: "number", foreground: "0e7490" },
      { token: "comment", foreground: "7c8796", fontStyle: "italic" },
      { token: "predefined", foreground: "6d4fd0" },
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#0f172a",
      "editorLineNumber.foreground": "#b6bfca",
      "editorLineNumber.activeForeground": "#4f5b6c",
      "editor.lineHighlightBackground": "#f6f8fa",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": "#d4e2fb",
      "editor.inactiveSelectionBackground": "#e8effc",
      "editorCursor.foreground": "#1d5fdb",
      "editorIndentGuide.background1": "#eceff3",
      "editorWidget.background": "#ffffff",
      "editorWidget.border": "#e2e6eb",
      "editorSuggestWidget.background": "#ffffff",
      "editorSuggestWidget.border": "#e2e6eb",
      "editorSuggestWidget.selectedBackground": "#e8effc",
      "scrollbarSlider.background": "#cbd2db80",
    },
  });
  monaco.editor.defineTheme("qp-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "5b9dff", fontStyle: "bold" },
      { token: "operator.sql", foreground: "a1a9b6" },
      { token: "string", foreground: "ff9a6b" },
      { token: "number", foreground: "4fc7d6" },
      { token: "comment", foreground: "7e8796", fontStyle: "italic" },
      { token: "predefined", foreground: "b09cff" },
    ],
    colors: {
      "editor.background": "#0e1116",
      "editor.foreground": "#eceef2",
      "editorLineNumber.foreground": "#3a4250",
      "editorLineNumber.activeForeground": "#a1a9b6",
      "editor.lineHighlightBackground": "#151922",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": "#1f3a6b",
      "editor.inactiveSelectionBackground": "#16264a",
      "editorCursor.foreground": "#5b9dff",
      "editorIndentGuide.background1": "#1c212b",
      "editorWidget.background": "#151922",
      "editorWidget.border": "#232a35",
      "editorSuggestWidget.background": "#151922",
      "editorSuggestWidget.border": "#232a35",
      "editorSuggestWidget.selectedBackground": "#16264a",
      "scrollbarSlider.background": "#3a425080",
    },
  });
}

export function codeFontFamily(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--font-code").trim();
  return `${value ? `${value}, ` : ""}ui-monospace, SFMono-Regular, Menlo, monospace`;
}
