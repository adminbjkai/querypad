/**
 * A tiny bridge to the active Monaco editor so non-editor UI (sidebar, palette,
 * history) can insert text or read the selection without prop drilling.
 */
interface EditorLike {
  getSelection(): { isEmpty(): boolean } | null;
  getModel(): { getValueInRange(range: unknown): string } | null;
  executeEdits(source: string, edits: { range: unknown; text: string; forceMoveMarkers?: boolean }[]): boolean;
  focus(): void;
}

let active: EditorLike | null = null;

export function registerEditor(editor: EditorLike | null): void {
  active = editor;
}

/** Selected SQL in the editor, or null when nothing is selected. */
export function getSelectedText(): string | null {
  const selection = active?.getSelection();
  if (!active || !selection || selection.isEmpty()) return null;
  return active.getModel()?.getValueInRange(selection) ?? null;
}

/** Insert text at the cursor (replacing any selection). Returns false if no editor is mounted. */
export function insertAtCursor(text: string): boolean {
  const selection = active?.getSelection();
  if (!active || !selection) return false;
  active.executeEdits("querypad", [{ range: selection, text, forceMoveMarkers: true }]);
  active.focus();
  return true;
}
