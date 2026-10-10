/** Monaco themes derived from the app tokens (Monaco needs literal hex colors). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineQueryPadThemes(monaco: any): void {
  monaco.editor.defineTheme("qp-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "0e6b5f", fontStyle: "bold" },
      { token: "operator.sql", foreground: "47544c" },
      { token: "string", foreground: "b04d1a" },
      { token: "number", foreground: "2a5bb0" },
      { token: "comment", foreground: "66736a", fontStyle: "italic" },
      { token: "predefined", foreground: "8a3a85" },
      // The base theme styles `predefined.sql` (functions) itself, so name it exactly.
      { token: "predefined.sql", foreground: "8a3a85" },
    ],
    colors: {
      "editor.background": "#fbfcfa",
      "editor.foreground": "#16201a",
      "editorLineNumber.foreground": "#b3beb1",
      "editorLineNumber.activeForeground": "#47544c",
      "editor.lineHighlightBackground": "#f2f5f0",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": "#e6ee9c",
      "editor.inactiveSelectionBackground": "#eef3c4",
      "editorCursor.foreground": "#0e6b5f",
      "editorIndentGuide.background1": "#e5eae3",
      "editorWidget.background": "#fbfcfa",
      "editorWidget.border": "#d5dcd3",
      "editorSuggestWidget.background": "#fbfcfa",
      "editorSuggestWidget.border": "#d5dcd3",
      "editorSuggestWidget.selectedBackground": "#d8ebe5",
      "scrollbarSlider.background": "#b3beb180",
    },
  });
  monaco.editor.defineTheme("qp-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "5ac6b2", fontStyle: "bold" },
      { token: "operator.sql", foreground: "a3b0a8" },
      { token: "string", foreground: "f09a6b" },
      { token: "number", foreground: "7ea9f4" },
      { token: "comment", foreground: "7f8c84", fontStyle: "italic" },
      { token: "predefined", foreground: "d59ce0" },
      { token: "predefined.sql", foreground: "d59ce0" },
    ],
    colors: {
      "editor.background": "#161e1a",
      "editor.foreground": "#e5ebe6",
      "editorLineNumber.foreground": "#435148",
      "editorLineNumber.activeForeground": "#a3b0a8",
      "editor.lineHighlightBackground": "#1c2520",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": "#3c4614",
      "editor.inactiveSelectionBackground": "#2c3412",
      "editorCursor.foreground": "#5ac6b2",
      "editorIndentGuide.background1": "#1e2823",
      "editorWidget.background": "#1c2520",
      "editorWidget.border": "#29342e",
      "editorSuggestWidget.background": "#1c2520",
      "editorSuggestWidget.border": "#29342e",
      "editorSuggestWidget.selectedBackground": "#163a33",
      "scrollbarSlider.background": "#43514880",
    },
  });
}

export function codeFontFamily(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--font-code").trim();
  return `${value ? `${value}, ` : ""}ui-monospace, SFMono-Regular, Menlo, monospace`;
}
