"use client";

import { useCollaborationStore } from "@/stores/collaboration-store";

/** Who else is editing; y-monaco draws their cursors inside the editor. */
export default function PeerCursors() {
  const remotePeers = useCollaborationStore((s) => s.remotePeers);
  if (remotePeers.length === 0) return null;
  return (
    <div className="hidden items-center gap-1 md:flex">
      {remotePeers.map((peer) => (
        <span
          key={peer.id}
          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px]"
          style={{ backgroundColor: `${peer.color}22`, color: peer.color }}
        >
          <span className="size-1.5 rounded-full" style={{ backgroundColor: peer.color }} />
          {peer.name}
        </span>
      ))}
    </div>
  );
}
