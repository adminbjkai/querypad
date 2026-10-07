"use client";

import dynamic from "next/dynamic";

// Start the engine as soon as this chunk runs, in parallel with the workspace chunk.
if (typeof window !== "undefined") void import("@/lib/duckdb/instance").then((m) => m.getDB()).catch(() => {});

// No splash: the real shell renders as soon as its chunk arrives and shows readiness locally.
const Workspace = dynamic(() => import("@/components/workspace/Workspace"), { ssr: false });

export default function Home() {
  return <Workspace />;
}
