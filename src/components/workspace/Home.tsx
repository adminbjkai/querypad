"use client";

import { useMemo } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { relationshipKey } from "@/lib/discovery/relationships";
import { copyAgentContext } from "@/lib/workspace-actions";
import { Icon } from "@/components/ui/icons";
import { SectionLabel, btn } from "@/components/ui/primitives";
import Composer, { askAssistant } from "@/components/home/Composer";
import Onboarding from "@/components/home/Onboarding";
import QuickActions from "@/components/home/QuickActions";
import RecentTabs from "@/components/home/RecentTabs";
import SemanticModel from "@/components/home/SemanticModel";
import { greeting } from "@/components/home/format";

const CHIPS = ["Summarize this space", "How do the tables connect?", "Find data quality issues", "Suggest an interesting query"];

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0">
      <dt>
        <SectionLabel as="div">{label}</SectionLabel>
      </dt>
      <dd className="mt-0.5 text-[16px] font-semibold leading-6 tabular-nums text-ink">
        {value}
        {detail && <span className="ml-2 text-[12px] font-normal text-muted">{detail}</span>}
      </dd>
    </div>
  );
}

/** The AI-first start page: ask, then pick up where you left off. */
export default function Home() {
  const tables = useWorkspaceStore((s) => s.tables);
  const views = useWorkspaceStore((s) => s.views);
  const profiles = useWorkspaceStore((s) => s.tableProfiles);
  const discovery = useWorkspaceStore((s) => s.discovery);
  const verdicts = useWorkspaceStore((s) => s.relationshipVerdicts);
  const unrestoredFiles = useWorkspaceStore((s) => s.unrestoredFiles);
  const unrestoredViews = useWorkspaceStore((s) => s.unrestoredViews);

  const hasData = tables.length + views.length > 0;
  const relationships = useMemo(
    () => discovery.relationships.filter((r) => verdicts[relationshipKey(r)] !== "rejected"),
    [discovery.relationships, verdicts]
  );
  const accepted = relationships.filter((r) => verdicts[relationshipKey(r)] === "accepted").length;
  const rows = tables.reduce((sum, t) => sum + t.rowCount, 0);
  const profiled = tables.filter((t) => profiles[t.name]?.status === "ready").length;

  return (
    <div className="qp-home-wash h-full min-h-0 flex-1 overflow-y-auto bg-surface">
      <div className="mx-auto w-full max-w-[1080px] px-5 pb-16 pt-6 sm:px-8">
        <div className="flex flex-wrap justify-end gap-2">
          <button className={btn.secondary} onClick={() => useUiStore.getState().setDialog("addFiles")}><Icon name="upload" size={16} />Add data</button>
          {hasData && (
            <button className={`${btn.secondary} max-sm:hidden`} onClick={() => void copyAgentContext()}><Icon name="copy" size={16} />Copy context for an agent</button>
          )}
        </div>

        <section aria-label="Ask the assistant" className="mx-auto mt-8 max-w-[760px] text-center">
          <p className="text-[13px] font-medium text-muted">{greeting()}</p>
          <h1 className="mt-2 text-balance text-[28px] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[30px]">
            What do you want to know <span className="text-accent">about your data?</span>
          </h1>
          <div className="mt-7 text-left">
            <Composer />
          </div>
          {hasData ? (
            <ul className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Suggested questions">
              {CHIPS.map((c, i) => (
                <li key={c} className={i >= 2 ? "max-sm:hidden" : undefined}>
                  <button
                    onClick={() => askAssistant(c)}
                    className="rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-muted shadow-sm transition-colors hover:border-line-strong hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  >
                    {c}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-[13px] text-muted">Add a file or load the sample data below, and the assistant can answer questions about it.</p>
          )}
        </section>

        {(unrestoredFiles.length > 0 || unrestoredViews.length > 0) && (
          <div role="alert" className="mt-8 rounded-lg border border-warn/30 bg-warn-soft p-4 text-[13px] text-warn">
            <p className="font-semibold">Some saved data could not be restored</p>
            <p className="mt-1">{[...unrestoredFiles, ...unrestoredViews].map((f) => f.name).join(", ")}. Re-add missing source files to continue working with them.</p>
          </div>
        )}

        {hasData ? (
          <>
            <QuickActions />
            <dl aria-label="Workspace summary" className="mt-10 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-4 sm:grid-cols-4">
              <Stat label="Datasets" value={String(tables.length + views.length)} detail={views.length ? `${views.length} ${views.length === 1 ? "view" : "views"}` : undefined} />
              <Stat label="Rows" value={rows.toLocaleString()} />
              <Stat label="Relationships" value={String(relationships.length)} detail={`${accepted} accepted · ${relationships.length - accepted} to review`} />
              <Stat label="Profiled" value={`${profiled} / ${tables.length}`} />
            </dl>
            <RecentTabs />
            <SemanticModel />
          </>
        ) : (
          <Onboarding />
        )}
      </div>
    </div>
  );
}
