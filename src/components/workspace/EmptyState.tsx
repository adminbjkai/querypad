"use client";

import { useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import DropTarget from "@/components/dropzone/DropTarget";
import UrlInput from "@/components/dropzone/UrlInput";
import { Spinner, btn } from "@/components/ui/primitives";

const STEPS = [
  ["Profile", "Every column gets types, null rates, ranges and top values."],
  ["Connect", "QueryPad finds the join keys between your files and scores each one."],
  ["Ask", "Write SQL, or describe what you want and let AI draft it with the right joins."],
] as const;

/** First screen when the workspace has no tables. */
export default function EmptyState() {
  const loadSampleData = useWorkspaceStore((s) => s.loadSampleData);
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex flex-1 justify-center overflow-y-auto px-5 py-10 sm:py-16">
      <div className="w-full max-w-2xl">
        <h1 className="text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-ink">
          Drop in your data files.
          <br />
          <span className="text-muted">See how they connect.</span>
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-6 text-muted">
          QueryPad loads CSV, Parquet, JSON and Excel into DuckDB right here in your browser, works out
          which tables join to which, and lets you query them in SQL or plain English.
        </p>

        <div className="mt-8">
          <DropTarget tall />
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1">
            <UrlInput />
          </div>
          <button
            onClick={() => {
              setLoading(true);
              void loadSampleData().finally(() => setLoading(false));
            }}
            className={btn.secondary}
            disabled={loading}
          >
            {loading && <Spinner />}
            Try sample data
          </button>
        </div>

        <ol className="mt-12 grid gap-6 border-t border-line pt-6 sm:grid-cols-3">
          {STEPS.map(([title, body], i) => (
            <li key={title}>
              <p className="flex items-baseline gap-2 text-[14px] font-semibold text-ink">
                <span className="font-mono text-[12px] text-join">{i + 1}</span>
                {title}
              </p>
              <p className="mt-1 text-[13px] leading-5 text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
