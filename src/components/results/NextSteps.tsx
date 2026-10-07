"use client";

import { useMemo, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { QueryResult } from "@/types";
import { computeNextSteps, type NextStep } from "@/lib/results/next-steps";
import { openSnippet, openTablePage } from "@/lib/workspace-actions";
import { Icon, type IconName } from "@/components/ui/icons";
import { SectionLabel, btn } from "@/components/ui/primitives";
import Popover from "./Popover";

const ICONS: Record<NextStep["kind"], IconName> = { join: "join", group: "rows", profile: "profile" };

/** Toolbar button + popover with up to three join-aware follow-ups, computed locally from the result and the discovered joins. */
export default function NextSteps({ result, sql }: { result: QueryResult; sql: string }) {
  const tables = useWorkspaceStore((s) => s.tables);
  const relationships = useWorkspaceStore((s) => s.discovery.relationships);
  const verdicts = useWorkspaceStore((s) => s.relationshipVerdicts);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = anchor !== null;

  const steps = useMemo(
    () => computeNextSteps({ sql, columns: result.columns, columnTypes: result.columnTypes, tables, relationships, verdicts }),
    [sql, result, tables, relationships, verdicts]
  );

  const apply = (step: NextStep) => {
    setAnchor(null);
    if (step.kind === "profile") openTablePage(step.table, "profile");
    else openSnippet(step.sql, step.title, true);
  };

  return (
    <>
      <button
        onClick={(e) => {
          const el = e.currentTarget;
          setAnchor((a) => (a ? null : el));
        }}
        aria-expanded={open}
        className={`${btn.ghost} ${open ? "bg-sunken text-ink" : ""}`}
        title="Suggested follow-ups, computed from the result and its joins"
      >
        <Icon name="sparkle" size={14} className="text-accent" />
        Next steps
      </button>
      {anchor && (
        <Popover anchor={anchor} label="Next steps" onClose={() => setAnchor(null)} width={320} align="right">
          <div className="px-3 py-2">
            <SectionLabel as="h3" className="mb-1.5">
              Next steps
            </SectionLabel>
            {steps.length === 0 ? (
              <p className="text-[12px] text-muted">Nothing to suggest for this result yet — run a query over a loaded table.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {steps.map((step) => (
                  <li key={step.label}>
                    <button
                      onClick={() => apply(step)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        step.kind === "join" ? "bg-join-soft text-join hover:brightness-95" : "bg-accent-soft text-accent hover:brightness-95"
                      }`}
                      title={`${step.label} — ${step.kind === "profile" ? "opens the table's profile page" : "opens in a new tab and runs"}`}
                    >
                      <Icon name={ICONS[step.kind]} size={14} />
                      <span className="min-w-0 flex-1 truncate">{step.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Popover>
      )}
    </>
  );
}
