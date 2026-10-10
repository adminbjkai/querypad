"use client";

import { Dialog, Kbd, MOD, SectionLabel } from "@/components/ui/primitives";

const KEYBOARD: [string, string[]][] = [
  ["Run query (or the selected part)", [MOD, "Enter"]],
  ["Run only the statement at the cursor", [MOD, "Shift", "Enter"]],
  ["Ask AI to write SQL", [MOD, "K"]],
  ["Open the Assistant chat", [MOD, "I"]],
  ["Show or hide the Tables panel (SQL, Notebooks)", [MOD, "B"]],
  ["Command palette", [MOD, "P"]],
  ["Format SQL", ["Shift", "Alt", "F"]],
  ["Save the query to the library", [MOD, "S"]],
  ["Save query or selection as a snippet", [MOD, "Shift", "S"]],
  ["Toggle Visual Query Designer", [MOD, "Shift", "V"]],
  ["Copy selected cells", [MOD, "C"]],
  ["Resize focused editor divider", ["↑", "↓"]],
  ["Resize the focused explorer edge", ["←", "→"]],
  ["Resize focused column handle", ["←", "→"]],
  ["This list", ["?"]],
];

/** "G then a letter" jumps to a page of the navigation. */
const NAVIGATION: [string, string[]][] = [
  ["Go to Home", ["G", "H"]],
  ["Go to Agent", ["G", "A"]],
  ["Go to SQL", ["G", "S"]],
  ["Go to Notebooks", ["G", "N"]],
  ["Go to Pipelines", ["G", "P"]],
  ["Go to Tables", ["G", "T"]],
  ["Go to Folders", ["G", "F"]],
];

/** Inside a notebook (a cell is focused). */
const NOTEBOOK: [string, string[]][] = [
  ["Run the cell", [MOD, "Enter"]],
  ["Run the cell and move to the next", ["Shift", "Enter"]],
  ["Run every cell", [MOD, "Shift", "Enter"]],
  ["Add a cell above / below", ["A", "B"]],
  ["Leave the editor, focus the cell", ["Esc"]],
];

const MOUSE: [string, string][] = [
  ["Resize the explorer", "Drag its right edge"],
  ["Reset the explorer width", "Double-click the edge"],
  ["Collapse the explorer", "Drag the edge most of the way closed"],
  ["Rename a tab", "Double-click"],
  ["Sort a column", "Click header"],
  ["Inspect a column", "Click its header stats"],
];

function Rows({ rows }: { rows: [string, string | string[]][] }) {
  return (
    <ul className="divide-y divide-line">
      {rows.map(([label, keys]) => (
        <li key={label} className="flex items-center justify-between gap-4 py-2 text-[13px]">
          <span className="text-ink">{label}</span>
          <Kbd combo={keys} />
        </li>
      ))}
    </ul>
  );
}

export default function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} width="max-w-sm">
      <SectionLabel>Keyboard</SectionLabel>
      <Rows rows={KEYBOARD} />
      <SectionLabel className="mt-4">Navigation</SectionLabel>
      <Rows rows={NAVIGATION} />
      <SectionLabel className="mt-4">Notebooks</SectionLabel>
      <Rows rows={NOTEBOOK} />
      <SectionLabel className="mt-4">Mouse</SectionLabel>
      <Rows rows={MOUSE} />
    </Dialog>
  );
}
