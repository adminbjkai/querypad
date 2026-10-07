"use client";

import { Component, type ReactNode } from "react";
import type { QueryResult } from "@/types";
import type { PluginExtension } from "@/types/plugin";

class PluginErrorBoundary extends Component<{ children: ReactNode; pluginName: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-4">
          <div className="rounded-lg border border-line bg-danger-soft p-3">
            <p className="text-[13px] font-semibold text-danger">The {this.props.pluginName} plugin crashed</p>
            <pre className="mt-1 whitespace-pre-wrap font-mono text-[12px] text-ink">{this.state.error.message}</pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function PluginVisualization({
  extension,
  pluginName,
  result,
}: {
  extension: Extract<PluginExtension, { type: "visualization" }>;
  pluginName: string;
  result: QueryResult;
}) {
  const View = extension.component;
  return (
    <PluginErrorBoundary pluginName={pluginName}>
      <div className="h-full overflow-auto">
        <View result={result} />
      </div>
    </PluginErrorBoundary>
  );
}
