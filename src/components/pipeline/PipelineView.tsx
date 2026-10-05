"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { executePipeline } from "@/lib/pipeline/execute";
import PipelineStepCard from "./PipelineStepCard";
import PipelineResults from "./PipelineResults";
import { Icon } from "@/components/ui/icons";
import { Spinner, btn } from "@/components/ui/primitives";

const PipelineDag = dynamic(() => import("./PipelineDag"), { ssr: false });

/** Pipeline mode: named SQL steps that build on each other, run in dependency order. */
export default function PipelineView() {
  const pipelines = useWorkspaceStore((s) => s.pipelines);
  const activePipelineId = useWorkspaceStore((s) => s.activePipelineId);
  const pipeline = pipelines.find((p) => p.id === activePipelineId);
  const addPipeline = useWorkspaceStore((s) => s.addPipeline);
  const removePipeline = useWorkspaceStore((s) => s.removePipeline);
  const setActivePipeline = useWorkspaceStore((s) => s.setActivePipeline);
  const addStep = useWorkspaceStore((s) => s.addPipelineStep);
  const removeStep = useWorkspaceStore((s) => s.removePipelineStep);
  const updateStep = useWorkspaceStore((s) => s.updatePipelineStep);
  const results = useWorkspaceStore((s) => s.pipelineResults);
  const setResults = useWorkspaceStore((s) => s.setPipelineResults);
  const tables = useWorkspaceStore((s) => s.tables);

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!pipeline) return;
    setRunning(true);
    try {
      const out = await executePipeline(pipeline.steps);
      setResults(Object.fromEntries(out.map((r) => [r.stepId, r])));
      const failed = out.find((r) => r.error);
      setSelectedStepId((failed ?? out[out.length - 1])?.stepId ?? null);
    } finally {
      setRunning(false);
    }
  };

  const tableNames = new Set(tables.map((t) => t.name.toLowerCase()));
  const conflicts = pipeline?.steps.filter((s) => s.name && tableNames.has(s.name.toLowerCase())).map((s) => s.name) ?? [];
  const selected = pipeline?.steps.find((s) => s.id === selectedStepId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-stretch border-b border-line bg-raised">
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto" role="tablist" aria-label="Pipelines">
          {pipelines.map((p) => {
            const active = p.id === activePipelineId;
            return (
              <div
                key={p.id}
                role="tab"
                aria-selected={active}
                tabIndex={0}
                onClick={() => setActivePipeline(p.id)}
                onKeyDown={(e) => e.key === "Enter" && setActivePipeline(p.id)}
                className={`group relative flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-line px-3 text-[13px] ${
                  active ? "bg-surface text-ink" : "text-muted hover:bg-sunken hover:text-ink"
                }`}
              >
                {active && <span className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
                <span className="max-w-[140px] truncate">{p.title}</span>
                {pipelines.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removePipeline(p.id);
                    }}
                    className="rounded p-0.5 text-faint opacity-0 hover:text-ink group-hover:opacity-100"
                    aria-label={`Delete ${p.title}`}
                  >
                    <Icon name="x" size={12} />
                  </button>
                )}
              </div>
            );
          })}
          <button onClick={addPipeline} className="flex w-9 shrink-0 items-center justify-center text-muted hover:bg-sunken hover:text-ink" aria-label="New pipeline">
            <Icon name="plus" size={15} />
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 px-2">
          {conflicts.length > 0 && (
            <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[11px] text-warn" title="A step with a table's name replaces that table for later steps">
              Shadows table: {conflicts.join(", ")}
            </span>
          )}
          {pipeline && (
            <>
              <button onClick={() => addStep(pipeline.id)} className={btn.ghost}>
                <Icon name="plus" size={14} />
                Step
              </button>
              <button onClick={() => void run()} disabled={running || pipeline.steps.length === 0} className={btn.primary}>
                {running ? <Spinner className="size-3" /> : <Icon name="play" size={13} className="fill-current" />}
                Run pipeline
              </button>
            </>
          )}
        </div>
      </div>

      {!pipeline ? (
        <p className="p-6 text-[13px] text-muted">Create a pipeline to chain SQL steps.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="flex w-full shrink-0 flex-col gap-2.5 overflow-y-auto border-b border-line bg-paper p-3 md:w-[340px] md:border-b-0 md:border-r">
            {pipeline.steps.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line-strong p-4 text-[13px] leading-5 text-muted">
                Each step is a SQL query saved as a temporary table named after the step. Later steps can select from earlier ones by name.
                <button onClick={() => addStep(pipeline.id)} className={`${btn.secondary} mt-3`}>
                  <Icon name="plus" size={14} />
                  Add the first step
                </button>
              </div>
            ) : (
              pipeline.steps.map((step) => (
                <PipelineStepCard
                  key={step.id}
                  step={step}
                  result={results[step.id]}
                  isSelected={step.id === selectedStepId}
                  onSelect={() => setSelectedStepId(step.id)}
                  onUpdateName={(name) => updateStep(pipeline.id, step.id, { name })}
                  onUpdateQuery={(query) => updateStep(pipeline.id, step.id, { query })}
                  onRemove={() => removeStep(pipeline.id, step.id)}
                />
              ))
            )}
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="h-1/2 min-h-[160px] border-b border-line bg-paper">
              <PipelineDag steps={pipeline.steps} results={results} selectedStepId={selectedStepId} onSelectStep={setSelectedStepId} />
            </div>
            <div className="min-h-0 flex-1">
              <PipelineResults stepName={selected?.name ?? ""} result={selected ? results[selected.id] ?? null : null} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
