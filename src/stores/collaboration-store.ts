import { create } from "zustand";
import type { PeerInfo } from "@/types/collaboration";

const PEER_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
];

function randomColor() {
  return PEER_COLORS[Math.floor(Math.random() * PEER_COLORS.length)];
}

function randomName() {
  const adjectives = ["Swift", "Bold", "Calm", "Keen", "Warm"];
  const animals = ["Fox", "Owl", "Bear", "Wolf", "Deer"];
  return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${animals[Math.floor(Math.random() * animals.length)]}`;
}

interface CollaborationState {
  // Room
  roomId: string | null;
  connected: boolean;
  connecting: boolean;
  /** Last connection error (e.g. relay unreachable), cleared on the next attempt. */
  error: string | null;

  // Peers
  localPeer: PeerInfo;
  remotePeers: PeerInfo[];

  // Y.Doc & y-websocket WebsocketProvider (stored as any to avoid importing yjs at module level)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ydoc: any | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any | null;

  // Actions
  setRoom: (roomId: string | null) => void;
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setError: (error: string | null) => void;
  setRemotePeers: (peers: PeerInfo[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setYDoc: (doc: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setProvider: (provider: any) => void;
  reset: () => void;
}

export const useCollaborationStore = create<CollaborationState>((set) => ({
  roomId: null,
  connected: false,
  connecting: false,
  error: null,
  localPeer: {
    id: crypto.randomUUID(),
    name: randomName(),
    color: randomColor(),
  },
  remotePeers: [],
  ydoc: null,
  provider: null,

  setRoom: (roomId) => set({ roomId }),
  setConnected: (connected) => set({ connected }),
  setConnecting: (connecting) => set({ connecting }),
  setError: (error) => set({ error }),
  setRemotePeers: (remotePeers) => set({ remotePeers }),
  setYDoc: (ydoc) => set({ ydoc }),
  setProvider: (provider) => set({ provider }),
  reset: () =>
    set({
      roomId: null,
      connected: false,
      connecting: false,
      error: null,
      remotePeers: [],
      ydoc: null,
      provider: null,
    }),
}));
