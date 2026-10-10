"use client";

import { useMemo } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUiStore } from "@/stores/ui-store";
import { relationshipKey } from "@/lib/discovery/relationships";
import { copyAgentContext } from "@/lib/workspace-actions";
import { Icon } from "@/components/ui/icons";
import { btn } from "@/components/ui/primitives";
import Composer, { askAssistant } from "@/components/home/Composer";
import Onboarding from "@/components/home/Onboarding";
import QuickActions from "@/components/home/QuickActions";
import RecentTabs from "@/components/home/RecentTabs";
import SchemaMap, { type MapObject } from "@/components/home/SchemaMap";
import SemanticModel from "@/components/home/SemanticModel";
import { greeting } from "@/components/home/format";

const CHIPS = ["Summarize this space", "How do the tables connect?", "Find data quality issues", "Suggest an interesting query"];

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="text-[20px] font-semibold leading-7 tabular-nums tracking-[-0.01em] text-ink">
        {value}
        {detail && <span className="ml-1.5 text-[12px] font-normal tracking-normal text-muted">{detail}</span>}
      </dd>
    </div>
  );
}

/**
 * Home: the space at a glance — its name and size, a map of how its tables connect, and one
 * place to ask about it — then the way back into recent work.
 */
export default function Home() {
  const tables = useWorkspaceStore((s) => s.tables);
  const views = useWorkspaceStore((s) => s.views);
  const profiles = useWorkspaceStore((s) => s.tableProfiles);
  const discovery = useWorkspaceStore((s) => s.discovery);
  const verdicts = useWorkspaceStore((s) => s.relationshipVerdicts);
  const unrestoredFiles = useWorkspaceStore((s) => s.unrestoredFiles);
  const unrestoredViews = useWorkspaceStore((s) => s.unrestoredViews);
  const spaceName = useWorkspaceStore((s) => s.spaces.find((sp) => sp.id === s.spaceId)?.name ?? "Space");
  const opening = useWorkspaceStore((s) => !s._hydrated);

  const hasData = tables.length + views.length > 0;
  const relationships = useMemo(
    () => discovery.relationships.filter((r) => verdicts[relationshipKey(r)] !== "rejected"),
    [discovery.relationships, verdicts]
  );
  const toReview = relationships.filter((r) => !verdicts[relationshipKey(r)]).length;
  const rows = tables.reduce((sum, t) => sum + t.rowCount, 0);
  const profiled = tables.filter((t) => profiles[t.name]?.status === "ready").length;
  const mapObjects = useMemo<MapObject[]>(
    () => [
      ...tables.map((t) => ({ name: t.name, rowCount: t.rowCount, columns: t.columns, view: false })),
      ...views.map((v) => ({ name: v.name, rowCount: null, columns: v.columns, view: true })),
    ],
    [tables, views]
  );

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto bg-surface">
      <div className="mx-auto w-full max-w-[1120px] px-5 pb-16 pt-7 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="text-[13px] text-muted">{greeting()}</p>
            <h1 className="qp-display mt-0.5 truncate text-[34px] leading-[40px] text-ink sm:text-[40px] sm:leading-[46px]" title={spaceName}>
              {spaceName}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={btn.secondary} onClick={() => useUiStore.getState().setDialog("addFiles")}>
              <Icon name="upload" size={16} />
              Add data
            </button>
            {hasData && (
              <button className={`${btn.secondary} max-sm:hidden`} onClick={() => void copyAgentContext()} title="Copy a Markdown brief of this space for another AI tool">
                <Icon name="copy" size={16} />
                Copy context
              </button>
            )}
          </div>
        </header>

        {opening ? (
          <dl aria-hidden="true" className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 sm:flex sm:flex-wrap">
            {["Tables", "Rows", "Joins", "Profiled"].map((label) => (
              <div key={label} className="min-w-0">
                <dt className="text-[12px] text-muted">{label}</dt>
                <dd className="flex h-7 items-center">
                  <div className="qp-skeleton h-5 w-14" />
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          hasData && (
            <dl aria-label="Workspace summary" className="mt-6 grid grid-cols-2 gap-x-10 gap-y-3 sm:flex sm:flex-wrap">
              <Stat
                label={views.length ? "Tables and views" : "Tables"}
                value={String(tables.length + views.length)}
                detail={views.length ? `${views.length} ${views.length === 1 ? "view" : "views"}` : undefined}
              />
              <Stat label="Rows" value={rows.toLocaleString()} />
              <Stat label="Joins" value={String(relationships.length)} detail={toReview ? `${toReview} to review` : undefined} />
              <Stat label="Profiled" value={`${profiled} of ${tables.length}`} />
            </dl>
          )
        )}

        {(unrestoredFiles.length > 0 || unrestoredViews.length > 0) && (
          <div role="alert" className="mt-6 rounded-lg border border-warn/30 bg-warn-soft p-4 text-[13px] text-warn">
            <p className="font-semibold">Some saved data could not be restored</p>
            <p className="mt-1">{[...unrestoredFiles, ...unrestoredViews].map((f) => f.name).join(", ")}. Re-add missing source files to continue working with them.</p>
          </div>
        )}

        {hasData && !opening && (
          <section aria-label="How the tables connect" className="mt-6">
            <SchemaMap objects={mapObjects} relationships={discovery.relationships} verdicts={verdicts} />
          </section>
        )}

        {!hasData && !opening && <Onboarding />}

        <section aria-label="Ask the assistant" className="mt-8">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">What do you want to know?</h2>
          <Composer />
          {hasData || opening ? (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Suggested questions">
              {CHIPS.map((c, i) => (
                <li key={c} className={i >= 2 ? "max-sm:hidden" : undefined}>
                  <button
                    onClick={() => askAssistant(c)}
                    className="rounded-md border border-line bg-raised px-2.5 py-1 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  >
                    {c}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] text-muted">Once a file is loaded, the assistant can answer questions about it.</p>
          )}
        </section>

        {hasData && !opening && (
          <>
            <QuickActions />
            <RecentTabs />
            <SemanticModel />
          </>
        )}
      </div>
    </div>
  );
}
