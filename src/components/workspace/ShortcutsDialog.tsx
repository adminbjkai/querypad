"use client";

import { Dialog, Kbd, MOD } from "@/components/ui/primitives";

const SHORTCUTS: [string, string[]][] = [
  ["Run query (or the selected part)", [MOD, "Enter"]],
  ["Ask AI to write SQL", [MOD, "K"]],
  ["Open the Assistant chat", [MOD, "I"]],
  ["Format SQL", ["Shift", "Alt", "F"]],
  ["Command palette", [MOD, "P"]],
  ["Save query or selection as a snippet", [MOD, "Shift", "S"]],
  ["Toggle sidebar", [MOD, "B"]],
  ["Rename a tab", ["Double-click"]],
  ["Copy selected cells", [MOD, "C"]],
  ["Resize focused editor divider", ["↑", "↓"]],
  ["Resize focused column handle", ["←", "→"]],
  ["Sort a column", ["Click header"]],
  ["This list", ["?"]],
];

export default function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} width="max-w-sm">
      <ul className="divide-y divide-line">
        {SHORTCUTS.map(([label, keys]) => (
          <li key={label} className="flex items-center justify-between gap-4 py-2 text-[13px]">
            <span className="text-ink">{label}</span>
            <span className="flex gap-1">
              {keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
