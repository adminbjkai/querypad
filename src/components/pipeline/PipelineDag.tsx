"use client";

import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
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
          border: `1.5px solid ${border}`,
          borderRadius: 8,
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
      <div className="flex h-full items-center justify-center text-[13px] text-muted">
        Steps and their dependencies appear here as a graph.
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick}
        fitView
        colorMode={theme}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background color="var(--line)" gap={18} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
