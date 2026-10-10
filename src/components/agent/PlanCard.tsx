"use client";

import { memo, useCallback, useState } from "react";
import { useAgentStore, type PlanTurn, type SessionStatus } from "@/stores/agent-store";
import { dangerReason, type NotebookDraft, type PlanStep, type StepKind, type StepResult } from "@/lib/agent/plan";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast, useUiStore } from "@/stores/ui-store";
import { copyText } from "@/lib/export/clipboard";
import DataTable from "@/components/results/DataTable";
import Markdown from "@/components/assistant/Markdown";
import { Icon } from "@/components/ui/icons";
import { Chip, Dialog, MOD, SectionLabel, Spinner, btn, kbdOnAccent, type ChipTone } from "@/components/ui/primitives";
import { LockGlyph } from "./glyphs";

const KIND: Record<StepKind, { label: string; tone: ChipTone; title: string }> = {
  read: { label: "Read", tone: "neutral", title: "Reads only — runs without asking" },
  write: { label: "Write", tone: "accent", title: "Changes data or the catalog — waits for your approval unless approvals are set to Auto" },
  danger: { label: "Danger", tone: "danger", title: "Destroys or rewrites data — always asks, with a confirmation" },
};

const GRID_HEIGHT = 240;

/** Open the step's SQL in a new workbench tab (not run). */
function openInSql(sql: string) {
  const ws = useWorkspaceStore.getState();
  ws.setViewMode("sql");
  if (ws.addTab(sql)) useUiStore.getState().setWorkspacePage("workbench");
}

function NotebookBlock({ notebook }: { notebook: NotebookDraft }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-raised">
      <div className="flex h-7 items-center gap-2 border-b border-line px-2.5">
        <SectionLabel as="div">Notebook</SectionLabel>
        <span className="min-w-0 truncate text-[12px] font-medium text-ink">{notebook.name}</span>
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-faint">{notebook.cells.length} cells</span>
      </div>
      <ol>
        {notebook.cells.map((cell, index) => (
          <li key={index} className="border-t border-line px-2.5 py-1.5 first:border-t-0">
            <p className="text-[11px] font-medium text-faint">{cell.kind === "sql" ? `SQL ${index + 1}` : `Text ${index + 1}`}</p>
            <pre className="mt-0.5 max-h-28 overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-ink">{cell.source}</pre>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SqlBlock({ sql }: { sql: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-raised">
      <div className="flex h-7 items-center justify-between border-b border-line px-2.5">
        <SectionLabel as="div">SQL</SectionLabel>
        <div className="flex items-center gap-0.5">
          <button onClick={() => void copyText(sql).then(() => toast("SQL copied."))} className={`${btn.ghost} !h-6 !px-1.5 text-[11px]`} aria-label="Copy SQL">
            <Icon name="copy" size={12} /> Copy
          </button>
          <button onClick={() => openInSql(sql)} className={`${btn.ghost} !h-6 !px-1.5 text-[11px]`} aria-label="Open in SQL" title="Open this statement in a new query tab">
            <Icon name="code" size={12} /> Open in SQL
          </button>
        </div>
      </div>
      <pre className="max-h-60 overflow-auto px-3 py-2 font-mono text-[12px] leading-[18px] text-ink">{sql}</pre>
    </div>
  );
}

function StatusGlyph({ step }: { step: PlanStep }) {
  const base = "flex size-5 shrink-0 items-center justify-center";
  switch (step.status) {
    case "running":
      return (
        <span className={`${base} text-accent`} title="Running">
          <Spinner className="size-3.5" />
        </span>
      );
    case "ok":
      return (
        <span className={`${base} text-ok`} title="Done">
          <Icon name="check" size={14} />
        </span>
      );
    case "error":
      return (
        <span className={`${base} text-danger`} title="Failed">
          <Icon name="alert" size={14} />
        </span>
      );
    case "skipped":
      return (
        <span className={`${base} text-faint`} title="Skipped">
          <span className="h-px w-2.5 bg-current" />
        </span>
      );
    case "approved":
      return (
        <span className={`${base}`} title="Approved">
          <span className="size-2 rounded-full bg-accent" />
        </span>
      );
    default:
      return (
        <span className={`${base}`} title="Pending">
          <span className="size-2 rounded-full border border-line-strong" />
        </span>
      );
  }
}

function outcome(result: StepResult, kind: StepKind): string {
  if (result.affected !== undefined) return `${result.affected.toLocaleString()} affected`;
  if (kind === "read" || result.columns.length > 0) return `${result.rowCount.toLocaleString()} ${result.rowCount === 1 ? "row" : "rows"}`;
  return "ran";
}

function ResultView({ result, label }: { result: StepResult; label: string }) {
  if (result.columns.length === 0) {
    return (
      <p className="flex h-8 items-center gap-2 text-[12px] text-muted">
        <Icon name="check" size={14} className="text-ok" /> Statement ran · <span className="tabular-nums">{result.ms} ms</span>
      </p>
    );
  }
  const height = Math.min(GRID_HEIGHT, 32 + Math.max(1, result.rows.length) * 28 + 28 + 2);
  return (
    <div className="overflow-hidden rounded-lg border border-line" style={{ height }} role="region" aria-label={label}>
      <DataTable result={{ columns: result.columns, columnTypes: result.columnTypes, rows: result.rows, rowCount: result.rowCount, executionTimeMs: result.ms }} />
    </div>
  );
}

function StepRow({
  step,
  index,
  total,
  awaiting,
  canRetry,
  onRun,
  onSkip,
  onRunAll,
  onRetry,
}: {
  step: PlanStep;
  index: number;
  total: number;
  /** This is the step the run is waiting on. */
  awaiting: boolean;
  canRetry: boolean;
  onRun: () => void;
  onSkip: () => void;
  onRunAll: () => void;
  onRetry: () => void;
}) {
  // The step being approved and a failed one open on their own (the SQL is what you're judging);
  // the user's own toggle wins until the next such moment.
  const auto = awaiting || step.status === "error";
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const [seenAuto, setSeenAuto] = useState(auto);
  if (seenAuto !== auto) {
    setSeenAuto(auto);
    if (auto) setUserOpen(null);
  }
  const open = userOpen ?? auto;
  const setOpen = (fn: (o: boolean) => boolean) => setUserOpen(fn(open));
  const kind = KIND[step.kind];
  const danger = step.kind === "danger" ? dangerReason(step.sql) : null;
  const showRunAll = awaiting && index < total - 1;

  return (
    <li className={`border-t border-line first:border-t-0 ${awaiting ? "bg-accent-soft/40" : ""}`} data-testid="agent-step" data-status={step.status}>
      <div className="flex min-h-9 items-center gap-2 px-3 py-1.5">
        <StatusGlyph step={step} />
        <span className="w-5 shrink-0 text-right text-[12px] tabular-nums text-faint">{index + 1}</span>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded text-left text-[13px] text-ink hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-expanded={open}
          aria-label={`Step ${index + 1}: ${step.title}`}
        >
          <span className="min-w-0 flex-1 truncate">{step.title}</span>
          <Icon name={open ? "chevronDown" : "chevronRight"} size={14} className="text-faint" />
        </button>
        <span title={danger ? `${kind.title} — this one ${danger}` : kind.title}>
          <Chip tone={kind.tone}>{kind.label}</Chip>
        </span>
        {step.result && (
          <span className="hidden shrink-0 text-[12px] tabular-nums text-muted sm:inline">
            {outcome(step.result, step.kind)} · {step.result.ms} ms
          </span>
        )}
      </div>
      {awaiting && (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-2 pl-[52px]" role="group" aria-label={`Approve step ${index + 1}`}>
          <span className="text-[12px] text-muted">
            {step.kind === "danger" ? `This step ${danger ?? "is destructive"}.` : step.notebook ? "This step creates a notebook in this space." : "This step changes data."}
          </span>
          <span className="flex-1" />
          <button onClick={onRun} className={step.kind === "danger" ? btn.danger : btn.primary}>
            <Icon name="play" size={12} /> Run
          </button>
          <button onClick={onSkip} className={btn.secondary}>
            Skip
          </button>
          {showRunAll && (
            <button onClick={onRunAll} className={btn.secondary} title="Run this and every later write without asking (destructive steps still ask)">
              Run all remaining
            </button>
          )}
        </div>
      )}
      {open && (
        <div className="space-y-2 px-3 pb-3 pl-[52px]">
          {step.notebook ? <NotebookBlock notebook={step.notebook} /> : <SqlBlock sql={step.sql} />}
          {step.result?.notebookId && (
            <button onClick={() => useUiStore.getState().openNotebook(step.result?.notebookId ?? null)} className={btn.secondary}>
              <Icon name="notebook" size={14} /> Open notebook
            </button>
          )}
          {step.status === "error" && step.error && (
            <div className="rounded-lg border border-line bg-danger-soft p-3" role="alert">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-danger">
                <Icon name="alert" size={14} /> This step failed
              </p>
              <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-ink">{step.error}</pre>
              {canRetry && (
                <button onClick={onRetry} className={`${btn.secondary} mt-2`}>
                  <Icon name="wand" size={14} /> Fix and retry
                </button>
              )}
            </div>
          )}
          {step.result && <ResultView result={step.result} label={`Result of step ${index + 1}`} />}
        </div>
      )}
    </li>
  );
}

/** One plan the agent proposed: summary, numbered steps with their gates, and the run controls. */
export default memo(function PlanCard({ turn, status, latest }: { turn: PlanTurn; status: SessionStatus; latest: boolean }) {
  const [confirming, setConfirming] = useState<PlanStep | null>(null);
  const closeConfirm = useCallback(() => setConfirming(null), []);
  const steps = turn.steps;
  const pending = steps.filter((s) => s.status === "pending" || s.status === "approved").length;
  const done = steps.filter((s) => s.status === "ok").length;
  const active = latest && !turn.planOnly;
  const awaitingId = active && status === "awaiting" ? steps.find((s) => s.status === "pending")?.id : undefined;
  const canRun = active && pending > 0 && (status === "idle" || status === "done" || status === "error");
  const store = useAgentStore.getState;

  const run = (step: PlanStep) => {
    if (step.kind === "danger") setConfirming(step);
    else store().approveStep(step.id);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface" role="region" aria-label="Plan">
      {turn.prose && (
        <div className="px-4 pt-3 text-[14px] leading-6 text-ink">
          <Markdown text={turn.prose} renderCode={(_, code) => <pre className="overflow-auto rounded-lg bg-raised px-3 py-2 font-mono text-[12px]">{code}</pre>} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Icon name="flow" size={16} className="text-accent" />
        <span className="min-w-0 flex-1 text-[13px] font-medium text-ink">{turn.summary}</span>
        <Chip>{steps.length} {steps.length === 1 ? "step" : "steps"}</Chip>
        {turn.planOnly && (
          <span title="Made in Plan mode — nothing runs">
            <Chip tone="warn" className="gap-1">
              <LockGlyph size={11} /> Plan only
            </Chip>
          </span>
        )}
        {turn.replans > 0 && <Chip tone="neutral">revised</Chip>}
      </div>
      <ol className="border-t border-line" aria-label="Steps">
        {steps.map((step, i) => (
          <StepRow
            key={step.id}
            step={step}
            index={i}
            total={steps.length}
            awaiting={step.id === awaitingId}
            canRetry={active && status === "error"}
            onRun={() => run(step)}
            onSkip={() => store().skipStep(step.id)}
            onRunAll={() => store().approveAll()}
            onRetry={() => void store().retryStep(step.id)}
          />
        ))}
      </ol>
      {active && (canRun || status === "done" || status === "running") && (
        <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
          <span className="text-[12px] text-muted">
            {status === "done" && pending === 0
              ? `${done} of ${steps.length} ${steps.length === 1 ? "step" : "steps"} ran`
              : status === "running"
                ? "Running…"
                : done > 0
                  ? `${done} done, ${pending} to go`
                  : "Reads run on their own; writes wait for you."}
          </span>
          <span className="flex-1" />
          {canRun && (
            <button onClick={() => store().runPlan()} className={btn.primary} title={`Run the plan (${MOD}+Enter)`}>
              <Icon name="play" size={12} /> {done > 0 ? "Continue plan" : "Run plan"}
              <span className={kbdOnAccent}>{MOD} ↵</span>
            </button>
          )}
        </div>
      )}
      {confirming && (
        <Dialog
          title="Run a destructive step?"
          onClose={closeConfirm}
          footer={
            <>
              <button onClick={closeConfirm} className={btn.secondary}>
                Cancel
              </button>
              <button
                onClick={() => {
                  store().approveStep(confirming.id);
                  closeConfirm();
                }}
                className={btn.danger}
              >
                Run step
              </button>
            </>
          }
          footerNote="There is no undo."
        >
          <p className="text-[14px] leading-5 text-ink">
            This step {dangerReason(confirming.sql) ?? "is destructive"}: <span className="font-medium">{confirming.title}</span>
          </p>
          <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-line bg-raised px-3 py-2 font-mono text-[12px] leading-[18px] text-ink">{confirming.sql}</pre>
        </Dialog>
      )}
    </div>
  );
});
