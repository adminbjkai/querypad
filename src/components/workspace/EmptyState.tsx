"use client";

import { useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useSnippetStore } from "@/stores/snippet-store";
import { useUiStore } from "@/stores/ui-store";
import DropTarget from "@/components/dropzone/DropTarget";
import UrlInput from "@/components/dropzone/UrlInput";
import { Icon, type IconName } from "@/components/ui/icons";
import { Spinner, btn } from "@/components/ui/primitives";

const STEPS: [IconName, string, string][] = [
  ["profile", "Profile", "Types, null rates, ranges and top values for every column."],
  ["join", "Connect", "Join keys between your files, found and scored."],
  ["sparkle", "Ask", "Write SQL, or describe what you want and let AI draft it."],
];

function relativeTime(at: number): string {
  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(at).toLocaleDateString();
}

function SectionLabel({ children }: { children: string }) {
  return <h2 className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">{children}</h2>;
}

function IconTile({ name }: { name: IconName }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-raised text-muted">
      <Icon name={name} size={18} />
    </span>
  );
}

/** First screen when the workspace has no tables: a home for getting data in. */
export default function EmptyState() {
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
    <div className="flex flex-1 justify-center overflow-y-auto bg-surface px-5 py-10 sm:py-14">
      <div className="w-full max-w-3xl">
        <h1 className="text-[20px] font-semibold leading-7 tracking-[-0.01em] text-ink">Start with your data</h1>
        <p className="mt-1 text-[13px] leading-5 text-muted">
          Load files into DuckDB right in your browser. QueryPad works out how they join, then you query in SQL or plain English.
        </p>

        <div className="mt-6">
          <DropTarget tall title="Drop in your data files." />
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
            <div className="flex items-start gap-3">
              <IconTile name="table" />
              <div className="min-w-0">
                <p className="text-[14px] font-medium leading-5 text-ink">Try a sample</p>
                <p className="text-[13px] leading-5 text-muted">Two linked tables, ready to query and join.</p>
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
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
            <div className="flex items-start gap-3">
              <IconTile name="link" />
              <div className="min-w-0">
                <p className="text-[14px] font-medium leading-5 text-ink">Load from URL</p>
                <p className="text-[13px] leading-5 text-muted">A public CSV, Parquet or JSON file.</p>
              </div>
            </div>
            <UrlInput />
          </div>
        </div>

        {(recent.length > 0 || topSnippets.length > 0) && (
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {recent.length > 0 && (
              <section aria-label="Recent spaces">
                <SectionLabel>Recent spaces</SectionLabel>
                <ul className="overflow-hidden rounded-lg border border-line">
                  {recent.map((s) => (
                    <li key={s.id} className="border-b border-line last:border-b-0">
                      <button
                        onClick={() => void switchSpace(s.id)}
                        className="flex h-9 w-full items-center gap-2 px-3 text-left transition-colors hover:bg-sunken"
                      >
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
                <SectionLabel>Snippets</SectionLabel>
                <ul className="overflow-hidden rounded-lg border border-line">
                  {topSnippets.map((sn) => (
                    <li key={sn.id} className="border-b border-line last:border-b-0">
                      <button
                        onClick={() => showPanel("snippets")}
                        title="Open the Snippets panel"
                        className="flex h-9 w-full items-center gap-2 px-3 text-left transition-colors hover:bg-sunken"
                      >
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
    </div>
  );
}
