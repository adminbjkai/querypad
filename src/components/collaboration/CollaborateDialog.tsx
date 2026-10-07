"use client";

import { useId, useState } from "react";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { toast } from "@/stores/ui-store";
import { connectToRoom, defaultCollabUrl } from "@/lib/collaboration/sync";
import { copyText } from "@/lib/export/clipboard";
import { Dialog, Segmented, Spinner, btn, input } from "@/components/ui/primitives";

export function inviteLink(roomId: string): string {
  return `${location.origin}/?room=${encodeURIComponent(roomId)}`;
}

/** Start or join a live room. Tabs, queries and small files sync between everyone in it. */
export default function CollaborateDialog({ onClose }: { onClose: () => void }) {
  const connecting = useCollaborationStore((s) => s.connecting);
  const error = useCollaborationStore((s) => s.error);
  const [mode, setMode] = useState<"create" | "join">("create");
  const [roomId, setRoomId] = useState("");
  const [server, setServer] = useState(defaultCollabUrl);
  const [showServer, setShowServer] = useState(false);
  const formId = useId();

  const submit = async () => {
    const raw = mode === "create" ? crypto.randomUUID().slice(0, 8) : roomId.trim();
    // Accept a pasted invite link as well as a bare room id.
    const id = raw.match(/[?&]room=([A-Za-z0-9_-]+)/)?.[1] ?? raw;
    if (!id) return;
    try {
      await connectToRoom(id, server);
      if (mode === "create") {
        await copyText(inviteLink(id)).catch(() => undefined);
        toast("Room started. Invite link copied — send it to whoever should join.", "success");
      } else {
        toast(`Joined room ${id}.`, "success");
      }
      onClose();
    } catch {
      // The store carries the error message; it renders below.
    }
  };

  return (
    <Dialog
      title="Collaborate live"
      onClose={onClose}
      width="max-w-sm"
      footer={
        <>
          <button type="button" onClick={onClose} className={btn.secondary}>
            Cancel
          </button>
          <button type="submit" form={formId} disabled={connecting || (mode === "join" && !roomId.trim())} className={btn.primary}>
            {connecting && <Spinner className="size-3" />}
            {connecting ? "Connecting…" : mode === "create" ? "Start room and copy invite" : "Join room"}
          </button>
        </>
      }
    >
      <Segmented
        value={mode}
        onChange={setMode}
        ariaLabel="Room mode"
        className="mb-4"
        options={[
          { value: "create", label: "Start a room" },
          { value: "join", label: "Join a room" },
        ]}
      />

      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-3"
      >
        {mode === "create" ? (
          <p className="text-[13px] leading-5 text-muted">
            Everyone in the room edits the same tabs and sees each other&apos;s cursors. Files under 5 MB are shared with the room.
          </p>
        ) : (
          <label className="block">
            <span className="mb-1 block text-[12px] text-muted">Room ID or invite link</span>
            <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="e.g. 3f9a2c1b" className={input} />
          </label>
        )}

        {showServer ? (
          <label className="block">
            <span className="mb-1 block text-[12px] text-muted">Relay server</span>
            <input value={server} onChange={(e) => setServer(e.target.value)} className={`${input} font-mono text-[12px]`} />
          </label>
        ) : (
          <button type="button" onClick={() => setShowServer(true)} className="text-[12px] text-faint hover:text-muted">
            Using this site&apos;s relay. Change server
          </button>
        )}

        {error && <p className="rounded-md bg-danger-soft px-2.5 py-2 text-[12px] text-danger">{error}</p>}
      </form>
    </Dialog>
  );
}
