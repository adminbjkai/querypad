"use client";

import { useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useSnippetStore } from "@/stores/snippet-store";
import { useUiStore } from "@/stores/ui-store";
import DropTarget from "@/components/dropzone/DropTarget";
import UrlInput from "@/components/dropzone/UrlInput";
import { Icon, type IconName } from "@/components/ui/icons";
import { SectionLabel, Spinner, btn } from "@/components/ui/primitives";
import { relativeTime } from "./format";

const STEPS: [IconName, string, string][] = [
  ["profile", "Profile", "Types, null rates, ranges and top values for every column."],
  ["join", "Connect", "Join keys between your files, found and scored."],
  ["sparkle", "Ask", "Write SQL, or describe what you want and let AI draft it."],
];

function IconTile({ name }: { name: IconName }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-raised text-accent">
      <Icon name={name} size={18} />
    </span>
  );
}

const rowBtn =
  "flex h-9 w-full items-center gap-2 px-3 text-left transition-colors hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";

/** Getting data in: shown on Home while the space has no tables. */
export default function Onboarding() {
  const loadSampleData = useWorkspaceStore((s) => s.loadSampleData);
  const spaces = useWorkspaceStore((s) => s.spaces);
  const spaceId = useWorkspaceStore((s) => s.spaceId);
  const switchSpace = useWorkspaceStore((s) => s.switchSpace);
  const snippets = useSnippetStore((s) => s.snippets);
  const showPanel = useUiStore((s) => s.showPanel);
  const [loading, setLoading] = useState(false);

  const recent = [...spaces]
    .filter((s) => s.id !== spaceId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5);
  const topSnippets = snippets.slice(0, 5);

  return (
    <div className="mt-12">
      <div className="qp-welcome-drop">
        <DropTarget tall title="Drop in your data files." />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong">
          <div className="flex items-start gap-3">
            <IconTile name="table" />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold leading-5 text-ink">Explore with sample data</p>
              <p className="mt-0.5 text-[13px] leading-5 text-muted">See profiling, relationships, and SQL in action.</p>
            </div>
          </div>
          <button
            onClick={() => {
              setLoading(true);
              void loadSampleData().finally(() => setLoading(false));
            }}
            className={`${btn.secondary} self-start`}
            disabled={loading}
          >
            {loading && <Spinner />}
            Try sample data
          </button>
        </div>
        <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong">
          <div className="flex items-start gap-3">
            <IconTile name="link" />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold leading-5 text-ink">Connect a public file</p>
              <p className="mt-0.5 text-[13px] leading-5 text-muted">Load a CSV, Parquet, or JSON file from a URL.</p>
            </div>
          </div>
          <UrlInput />
        </div>
      </div>

      {(recent.length > 0 || topSnippets.length > 0) && (
        <div className="mt-9 grid gap-6 md:grid-cols-2">
          {recent.length > 0 && (
            <section aria-label="Recent spaces">
              <SectionLabel className="px-1 pb-1.5">Recent spaces</SectionLabel>
              <ul className="overflow-hidden rounded-lg border border-line">
                {recent.map((s) => (
                  <li key={s.id} className="border-b border-line last:border-b-0">
                    <button onClick={() => void switchSpace(s.id)} className={rowBtn}>
                      <Icon name="folder" size={14} className="text-faint" />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{s.name}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-faint">
                        {s.tableCount} {s.tableCount === 1 ? "table" : "tables"}
                      </span>
                      <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-faint">{relativeTime(s.updatedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {topSnippets.length > 0 && (
            <section aria-label="Saved snippets">
              <SectionLabel className="px-1 pb-1.5">Snippets</SectionLabel>
              <ul className="overflow-hidden rounded-lg border border-line">
                {topSnippets.map((sn) => (
                  <li key={sn.id} className="border-b border-line last:border-b-0">
                    <button onClick={() => showPanel("snippets")} title="Open the Snippets panel" className={rowBtn}>
                      <Icon name="bookmark" size={14} className="text-faint" />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{sn.name}</span>
                      {sn.folder && <span className="shrink-0 truncate text-[11px] text-faint">{sn.folder}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <ol className="mt-8 grid gap-4 border-t border-line pt-5 sm:grid-cols-3">
        {STEPS.map(([icon, title, body]) => (
          <li key={title} className="flex items-start gap-2.5">
            <Icon name={icon} size={16} className="mt-0.5 text-faint" />
            <div>
              <p className="text-[13px] font-medium text-ink">{title}</p>
              <p className="text-[12px] leading-4 text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
