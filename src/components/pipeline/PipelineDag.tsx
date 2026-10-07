"use client";

import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Controls,
  type Node,
  type Edge,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { Icon } from "@/components/ui/icons";
import { extractEdges } from "@/lib/pipeline/graph";
import type { PipelineStep, PipelineExecutionResult } from "@/types/pipeline";
import { useUiStore } from "@/stores/ui-store";
import "@xyflow/react/dist/style.css";

interface PipelineDagProps {
  steps: PipelineStep[];
  results: Record<string, PipelineExecutionResult>;
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 50;

function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 80 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

export default function PipelineDag({
  steps,
  results,
  selectedStepId,
  onSelectStep,
}: PipelineDagProps) {
  const theme = useUiStore((s) => s.theme);
  const { nodes, edges } = useMemo(() => {
    const rawEdges = extractEdges(steps);

    const nodes: Node[] = steps.map((step) => {
      const r = results[step.id];
      let bg = "var(--surface)";
      let border = "var(--line-strong)";
      if (r) {
        bg = r.error ? "var(--danger-soft)" : "var(--ok-soft)";
        border = r.error ? "var(--danger)" : "var(--ok)";
      }
      if (step.id === selectedStepId) border = "var(--accent)";

      return {
        id: step.id,
        data: { label: step.name || "(unnamed)" },
        position: { x: 0, y: 0 },
        style: {
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: 6,
          padding: "8px 14px",
          fontSize: 12,
          fontFamily: "var(--font-code), monospace",
          fontWeight: 500,
          color: "var(--ink)",
          cursor: "pointer",
          width: NODE_WIDTH,
        },
      };
    });

    const edges: Edge[] = rawEdges.map(([source, target]) => ({
      id: `${source}-${target}`,
      source,
      target,
      animated: true,
      style: { stroke: "var(--join)", strokeWidth: 1.75 },
    }));

    return getLayoutedElements(nodes, edges);
  }, [steps, results, selectedStepId]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onSelectStep(node.id);
    },
    [onSelectStep]
  );

  if (steps.length === 0) {
    return (
      <div className="qp-dotgrid flex h-full flex-col items-center justify-center gap-2 bg-surface text-center">
        <span className="flex size-9 items-center justify-center rounded-lg bg-raised text-muted">
          <Icon name="flow" size={18} />
        </span>
        <p className="text-[14px] font-medium text-ink">No graph yet</p>
        <p className="max-w-xs text-balance px-4 text-[13px] text-muted">Steps and their dependencies appear here as a graph.</p>
      </div>
    );
  }

  return (
    <div className="qp-dotgrid h-full w-full bg-surface">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick}
        fitView
        colorMode={theme}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        // A read-only graph: React Flow's window-level key bindings (Space to pan, Backspace to
        // delete…) would otherwise swallow those keys while typing in the step editors.
        panActivationKeyCode={null}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        zoomActivationKeyCode={null}
        style={{ background: "transparent" }}
      >
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
