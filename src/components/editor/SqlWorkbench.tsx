"use client";

import { useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useUiStore } from "@/stores/ui-store";
import TabBar from "./TabBar";
import SqlEditor from "./QueryEditor";
import ResultsPanel from "@/components/results/ResultsPanel";

const AiAssistant = dynamic(() => import("./AiAssistant"), { ssr: false });

/** Tabs, editor and results in a resizable vertical split. */
export default function SqlWorkbench() {
  const fraction = useUiStore((s) => s.editorFraction);
  const setFraction = useUiStore((s) => s.setEditorFraction);
  const aiOpen = useUiStore((s) => s.aiOpen);
  const containerRef = useRef<HTMLDivElement>(null);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const move = (ev: PointerEvent) => setFraction((ev.clientY - rect.top) / rect.height);
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        document.body.style.cursor = "";
      };
      document.body.style.cursor = "row-resize";
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [setFraction]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TabBar />
      {aiOpen && <AiAssistant />}
      <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
        <div style={{ height: `${fraction * 100}%` }} className="min-h-[96px]">
          <SqlEditor />
        </div>
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize editor"
          tabIndex={0}
          onPointerDown={startDrag}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") setFraction(fraction - 0.05);
            if (e.key === "ArrowDown") setFraction(fraction + 0.05);
          }}
          onDoubleClick={() => setFraction(0.45)}
          className="group relative z-10 h-1.5 shrink-0 cursor-row-resize border-y border-line bg-raised hover:bg-accent-soft focus-visible:bg-accent-soft"
        >
          <span className="absolute left-1/2 top-1/2 h-0.5 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-line-strong group-hover:bg-accent" />
        </div>
        <div className="min-h-0 flex-1">
          <ResultsPanel />
        </div>
      </div>
    </div>
  );
}
