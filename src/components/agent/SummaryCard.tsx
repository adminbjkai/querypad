"use client";

import { memo } from "react";
import type { SummaryTurn } from "@/stores/agent-store";
import { toast, useUiStore } from "@/stores/ui-store";
import { copyText } from "@/lib/export/clipboard";
import Markdown from "@/components/assistant/Markdown";
import { Icon } from "@/components/ui/icons";
import { SectionLabel, btn } from "@/components/ui/primitives";

function TableLink({ name, note }: { name: string; note?: string }) {
  return (
    <li>
      <button
        onClick={() => useUiStore.getState().openTablePage(name)}
        className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-line bg-surface px-2 font-mono text-[12px] text-ink hover:border-line-strong hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={`Open table ${name}`}
        title="Open this table's page"
      >
        <Icon name="table" size={14} className="text-accent" />
        <span className="truncate">{name}</span>
        {note && <span className="text-muted">{note}</span>}
      </button>
    </li>
  );
}

/** What a finished plan changed: objects (as links), the keys it chose, and follow-up ideas. */
export default memo(function SummaryCard({ turn, onFollowUp }: { turn: SummaryTurn; onFollowUp: (text: string) => void }) {
  const { diff } = turn;
  const hasObjects = diff.tablesAdded.length + diff.rowDeltas.length + diff.viewsAdded.length + diff.tablesRemoved.length + diff.viewsRemoved.length > 0;
  return (
    <div className="rounded-lg border border-line bg-surface p-4" role="region" aria-label="Summary">
      <div className="flex items-center gap-2">
        <Icon name="approve" size={16} className="text-ok" />
        <SectionLabel as="div">Summary</SectionLabel>
        <span className="flex-1" />
        <button onClick={() => void copyText(turn.content).then(() => toast("Response copied."))} className={`${btn.ghost} !h-6 text-[11px]`} aria-label="Copy response">
          <Icon name="copy" size={12} /> Copy response
        </button>
      </div>
      <div className="mt-2 text-[14px] leading-6 text-ink">
        <Markdown text={turn.content} renderCode={(_, code) => <pre className="overflow-auto rounded-lg bg-raised px-3 py-2 font-mono text-[12px]">{code}</pre>} />
      </div>
      {hasObjects && (
        <div className="mt-3">
          <SectionLabel as="div">Objects</SectionLabel>
          <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Objects created or changed">
            {diff.tablesAdded.map((t) => (
              <TableLink key={`a${t}`} name={t} note="new" />
            ))}
            {diff.rowDeltas.map((d) => (
              <TableLink key={`r${d.name}`} name={d.name} note={`${d.before.toLocaleString()} → ${d.after.toLocaleString()} rows`} />
            ))}
            {diff.viewsAdded.map((v) => (
              <TableLink key={`v${v}`} name={v} note="view" />
            ))}
            {[...diff.tablesRemoved, ...diff.viewsRemoved].map((t) => (
              <li key={`d${t}`} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line px-2 font-mono text-[12px] text-muted line-through">
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}
      {turn.keys.length > 0 && (
        <div className="mt-3">
          <SectionLabel as="div">Keys chosen</SectionLabel>
          <ul className="mt-1 space-y-0.5 text-[13px] leading-5 text-muted">
            {turn.keys.map((k) => (
              <li key={k} className="flex gap-1.5">
                <Icon name="key" size={14} className="mt-0.5 shrink-0 text-join" /> {k}
              </li>
            ))}
          </ul>
        </div>
      )}
      {turn.suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Follow-ups">
          {turn.suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onFollowUp(s)}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-line bg-surface px-2.5 text-[12px] text-muted transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              title="Put this in the composer"
            >
              <span aria-hidden="true">↳</span> {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
