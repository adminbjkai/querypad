/** Monaco themes derived from the app tokens (Monaco needs literal hex colors). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineQueryPadThemes(monaco: any): void {
  monaco.editor.defineTheme("qp-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "1a6ce7", fontStyle: "bold" },
      { token: "operator.sql", foreground: "5c6878" },
      { token: "string", foreground: "b4471d" },
      { token: "number", foreground: "1d7a86" },
      { token: "comment", foreground: "8c97a4", fontStyle: "italic" },
      { token: "predefined", foreground: "6a4fc9" },
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#1b2433",
      "editorLineNumber.foreground": "#bcc5cf",
      "editorLineNumber.activeForeground": "#5c6878",
      "editor.lineHighlightBackground": "#f6f8fa",
      "editor.selectionBackground": "#d9defb",
      "editorCursor.foreground": "#1a6ce7",
      "editorIndentGuide.background1": "#e6eaef",
      "editorWidget.background": "#ffffff",
      "editorWidget.border": "#d6dce3",
      "editorSuggestWidget.selectedBackground": "#e6e9fb",
    },
  });
  monaco.editor.defineTheme("qp-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "58a6ff", fontStyle: "bold" },
      { token: "operator.sql", foreground: "95a2b2" },
      { token: "string", foreground: "ff9466" },
      { token: "number", foreground: "4ec4d1" },
      { token: "comment", foreground: "66748a", fontStyle: "italic" },
      { token: "predefined", foreground: "ab95ff" },
    ],
    colors: {
      "editor.background": "#121a23",
      "editor.foreground": "#e2e8ef",
      "editorLineNumber.foreground": "#33425a",
      "editorLineNumber.activeForeground": "#95a2b2",
      "editor.lineHighlightBackground": "#18222d",
      "editor.selectionBackground": "#2a3570",
      "editorCursor.foreground": "#58a6ff",
      "editorIndentGuide.background1": "#1d2733",
      "editorWidget.background": "#18222d",
      "editorWidget.border": "#243040",
      "editorSuggestWidget.selectedBackground": "#1e2650",
    },
  });
}

export function codeFontFamily(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--font-code").trim();
  return `${value ? `${value}, ` : ""}ui-monospace, SFMono-Regular, Menlo, monospace`;
}
