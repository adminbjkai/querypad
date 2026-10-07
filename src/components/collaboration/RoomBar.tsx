"use client";

import { useCollaborationStore } from "@/stores/collaboration-store";
import { toast } from "@/stores/ui-store";
import { disconnectFromRoom } from "@/lib/collaboration/sync";
import { copyText } from "@/lib/export/clipboard";
import { inviteLink } from "./CollaborateDialog";
import { btn } from "@/components/ui/primitives";

export default function RoomBar() {
  const roomId = useCollaborationStore((s) => s.roomId);
  const connected = useCollaborationStore((s) => s.connected);
  const remotePeers = useCollaborationStore((s) => s.remotePeers);
  const localPeer = useCollaborationStore((s) => s.localPeer);
  if (!roomId) return null;

  const people = [{ ...localPeer, name: `${localPeer.name} (you)` }, ...remotePeers];

  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-raised py-0.5 pl-2 pr-0.5 text-[12px]">
      <span
        className={`size-2 rounded-full ${connected ? "bg-ok" : "animate-pulse bg-warn"}`}
        title={connected ? "Connected" : "Reconnecting"}
      />
      <button
        onClick={() => void copyText(inviteLink(roomId)).then(() => toast("Invite link copied.", "success"))}
        className="font-mono text-muted hover:text-ink"
        title="Copy invite link"
      >
        {roomId}
      </button>
      <div className="flex -space-x-1.5">
        {people.slice(0, 5).map((peer) => (
          <span
            key={peer.id}
            className="flex size-5 items-center justify-center rounded-full border-2 border-raised text-[10px] font-semibold text-on-accent"
            style={{ backgroundColor: peer.color }}
            title={peer.name}
          >
            {peer.name[0]}
          </span>
        ))}
      </div>
      <button onClick={disconnectFromRoom} className={`${btn.ghost} h-6 px-1.5 text-[12px] hover:text-danger`}>
        Leave
      </button>
    </div>
  );
}
