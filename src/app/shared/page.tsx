"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { getDB } from "@/lib/duckdb/instance";
import { decodeShare } from "@/lib/sharing/decode";
import { loadBufferAsTable } from "@/lib/duckdb/files";
import { useWorkspaceStore } from "@/stores/workspace-store";
import Splash from "@/components/workspace/Splash";

const Workspace = dynamic(() => import("@/components/workspace/Workspace"), { ssr: false });

function SharedLoader() {
  const encoded = useSearchParams().get("s");
  const [state, setState] = useState<"loading" | "ready" | string>(encoded ? "loading" : "missing");

  useEffect(() => {
    if (!encoded) return;
    let cancelled = false;
    (async () => {
      try {
        // Viewing a link must never write to your saved spaces.
        useWorkspaceStore.setState({ persistEnabled: false });
        await getDB();
        const shared = decodeShare(encoded);
        const ws = useWorkspaceStore.getState();
        for (const entry of shared.tables) {
          const table = await loadBufferAsTable(entry.name, entry.fileName, new Uint8Array(entry.data));
          ws.addTable(table, entry.fileName, entry.data);
        }
        if (shared.query) ws.updateTab(ws.activeTabId, { query: shared.query });
        useWorkspaceStore.setState({ dbReady: true, _hydrated: true });
        if (!cancelled) setState("ready");
      } catch (err) {
        console.error("Failed to load shared data:", err);
        if (!cancelled) setState(err instanceof Error ? err.message : "The link could not be decoded.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [encoded]);

  if (state === "ready") return <Workspace />;
  if (state === "loading") return <Splash message="Opening shared workspace" />;
  return (
    <Splash
      tone="error"
      message="This share link could not be opened."
      detail={state === "missing" ? "The link has no data in it. Ask for a fresh link." : `${state}. The link may be truncated — copy it again in full.`}
    />
  );
}

export default function SharedPage() {
  return (
    <Suspense fallback={<Splash message="Opening shared workspace" />}>
      <SharedLoader />
    </Suspense>
  );
}
