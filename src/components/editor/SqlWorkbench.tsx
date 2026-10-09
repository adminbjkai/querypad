"use client";

import { useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useUiStore } from "@/stores/ui-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { MAX_RESULT_ROWS } from "@/lib/duckdb/queries";
import { Icon } from "@/components/ui/icons";
import TabBar from "./TabBar";
import SqlEditor from "./QueryEditor";
import ResultsPanel from "@/components/results/ResultsPanel";
import QueryDesigner from "@/components/query/QueryDesigner";
import SchemaControl from "./SchemaControl";

const AiAssistant = dynamic(() => import("./AiAssistant"), { ssr: false });

/** Space, schema and result limit — the worksheet's context, in the role Snowsight gives database / schema / warehouse. */
function WorksheetContext() {
  const spaceName = useWorkspaceStore((s) => s.spaces.find((sp) => sp.id === s.spaceId)?.name ?? "Space");
  const designerOpen = useUiStore((s) => s.designerOpen);
  const toggleDesigner = useUiStore((s) => s.toggleDesigner);
  return (
    <div className="flex h-8 shrink-0 items-center gap-4 overflow-hidden border-b border-line bg-chrome px-3 text-[12px]" aria-label="Worksheet context">
      <span className="flex min-w-0 items-center gap-1.5" title="Tables in this worksheet belong to the open space">
        <span className="text-faint">Space</span>
        <Icon name="database" size={14} className="shrink-0 text-accent" />
        <span className="truncate font-medium text-ink">{spaceName}</span>
      </span>
      <SchemaControl />
      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={toggleDesigner}
          className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[12px] font-medium transition-colors ${
            designerOpen
              ? "bg-accent-soft text-accent"
              : "text-muted hover:bg-sunken hover:text-ink"
          }`}
          title={designerOpen ? "Switch to SQL code editor" : "Switch to Visual Query Designer"}
          aria-label={designerOpen ? "Switch to SQL editor" : "Switch to Visual Query Designer"}
          aria-pressed={designerOpen}
        >
          <Icon name={designerOpen ? "code" : "table"} size={13} />
          <span>{designerOpen ? "Visual Designer" : "Visual Builder"}</span>
        </button>
        <span
          className="flex shrink-0 items-center gap-1.5"
          title={`The grid loads the first ${MAX_RESULT_ROWS.toLocaleString()} rows. Parquet export includes every row.`}
        >
          <span className="text-faint">Limit</span>
          <span className="tabular-nums font-medium text-ink">{MAX_RESULT_ROWS.toLocaleString()}</span>
        </span>
      </div>
    </div>
  );
}

/** Tabs, editor and results in a resizable vertical split. */
export default function SqlWorkbench() {
  const fraction = useUiStore((s) => s.editorFraction);
  const setFraction = useUiStore((s) => s.setEditorFraction);
  const aiOpen = useUiStore((s) => s.aiOpen);
  const designerOpen = useUiStore((s) => s.designerOpen);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => dragCleanupRef.current?.(), []);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      e.preventDefault();
      dragCleanupRef.current?.();
      const rect = container.getBoundingClientRect();
      const move = (ev: PointerEvent) => {
        let next = Math.max(0.15, Math.min(0.85, (ev.clientY - rect.top) / rect.height));
        if (rect.height >= 198) {
          const minimum = 96 / rect.height;
          next = Math.max(minimum, Math.min(1 - minimum, next));
        }
        setFraction(next);
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", cleanup);
        window.removeEventListener("pointercancel", cleanup);
        document.body.style.cursor = "";
        dragCleanupRef.current = null;
      };
      dragCleanupRef.current = cleanup;
      document.body.style.cursor = "row-resize";
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", cleanup);
      window.addEventListener("pointercancel", cleanup);
    },
    [setFraction]
  );

  return (
    // The editor column never squeezes below the point where its tab strip and Run button fit.
    <div className="flex min-h-0 min-w-[320px] flex-1 flex-col">
      <TabBar />
      <WorksheetContext />
      {aiOpen && <AiAssistant />}
      <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
        <div id="querypad-editor-pane" style={{ height: `${fraction * 100}%` }} className="min-h-[96px]">
          {designerOpen ? <QueryDesigner /> : <SqlEditor />}
        </div>
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize editor"
          aria-controls="querypad-editor-pane querypad-results-pane"
          aria-valuemin={15}
          aria-valuemax={85}
          aria-valuenow={Math.round(fraction * 100)}
          aria-valuetext={`Editor ${Math.round(fraction * 100)}%, results ${100 - Math.round(fraction * 100)}%`}
          tabIndex={0}
          onPointerDown={startDrag}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setFraction(fraction - 0.05);
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setFraction(fraction + 0.05);
            }
            if (e.key === "Home") {
              e.preventDefault();
              setFraction(0.15);
            }
            if (e.key === "End") {
              e.preventDefault();
              setFraction(0.85);
            }
          }}
          onDoubleClick={() => setFraction(0.45)}
          className="group relative z-10 h-1.5 shrink-0 cursor-row-resize border-y border-line bg-raised hover:bg-accent-soft focus-visible:bg-accent-soft"
        >
          <span className="absolute left-1/2 top-1/2 h-0.5 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-line-strong group-hover:bg-accent" />
        </div>
        <div id="querypad-results-pane" className="min-h-0 flex-1">
          <ResultsPanel />
        </div>
      </div>
    </div>
  );
}
