"use client";

import dynamic from "next/dynamic";
import { useUiStore } from "@/stores/ui-store";
import { defineQueryPadThemes, codeFontFamily } from "@/lib/monaco-theme";
import type { PipelineStep, PipelineExecutionResult } from "@/types/pipeline";
import { Icon } from "@/components/ui/icons";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="h-full bg-surface" />,
});

interface PipelineStepCardProps {
  step: PipelineStep;
  result?: PipelineExecutionResult;
  isSelected: boolean;
  onSelect: () => void;
  onUpdateName: (name: string) => void;
  onUpdateQuery: (query: string) => void;
  onRemove: () => void;
}

export default function PipelineStepCard({ step, result, isSelected, onSelect, onUpdateName, onUpdateQuery, onRemove }: PipelineStepCardProps) {
  const theme = useUiStore((s) => s.theme);
  const status = result ? (result.error ? "error" : "ok") : "idle";

  return (
    <div
      onClick={onSelect}
      className={`overflow-hidden rounded-lg border bg-surface transition-colors ${
        isSelected ? "border-accent ring-1 ring-accent" : status === "error" ? "border-danger/50" : "border-line"
      }`}
    >
      <div className="flex items-center gap-2 h-8 border-b border-line bg-raised px-2.5">
        <span className={`size-1.5 shrink-0 rounded-full ${status === "ok" ? "bg-ok" : status === "error" ? "bg-danger" : "bg-line-strong"}`} />
        <input
          value={step.name}
          onChange={(e) => onUpdateName(e.target.value.replace(/\s/g, "_"))}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 bg-transparent font-mono text-[13px] font-medium text-ink outline-none focus:text-accent"
          placeholder="step_name"
          aria-label="Step name (becomes a table name)"
        />
        {result && !result.error && <span className="text-[11px] tabular-nums text-faint">{result.executionTimeMs} ms</span>}
        {result?.error && (
          <span className="text-[11px] text-danger" title={result.error.message}>
            failed
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="rounded p-0.5 text-faint transition-colors hover:text-danger"
          aria-label={`Remove step ${step.name}`}
        >
          <Icon name="x" size={13} />
        </button>
      </div>
      <div className="h-[112px]" onClick={(e) => e.stopPropagation()}>
        <MonacoEditor
          defaultLanguage="sql"
          value={step.query}
          onChange={(v) => onUpdateQuery(v ?? "")}
          beforeMount={defineQueryPadThemes}
          theme={theme === "dark" ? "qp-dark" : "qp-light"}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            fontFamily: codeFontFamily(),
            lineNumbers: "off",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            padding: { top: 6 },
            automaticLayout: true,
            folding: false,
            glyphMargin: false,
            lineDecorationsWidth: 8,
            overviewRulerLanes: 0,
            renderLineHighlight: "none",
            scrollbar: { verticalScrollbarSize: 6 },
          }}
        />
      </div>
    </div>
  );
}
