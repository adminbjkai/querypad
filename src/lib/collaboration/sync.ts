import type * as Yjs from "yjs";
import type { WebsocketProvider as WebsocketProviderType } from "y-websocket";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { startFileSync, stopFileSync } from "@/lib/collaboration/file-sync";
import type { EditorTab } from "@/types";
import type { PeerInfo } from "@/types/collaboration";

const CONNECT_TIMEOUT_MS = 8000;

/** Transaction origin for changes this module writes into the Y.Doc. */
const LOCAL_ORIGIN = "querypad-store";

/** Tab metadata shared via the Y "tabs" array. Query text lives in per-tab Y.Text. */
interface YTabMeta {
  id: string;
  title: string;
  createdAt: number;
}

let cleanups: Array<() => void> = [];
let applyingRemote = false;

/**
 * Default relay URL: same origin, `/collab` path (nginx proxies it to the relay).
 * Override with NEXT_PUBLIC_COLLAB_URL (e.g. `ws://localhost:1999/collab` in dev).
 */
export function defaultCollabUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_COLLAB_URL;
  if (fromEnv) return fromEnv;
  if (typeof location === "undefined") return "ws://localhost:1999/collab";
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/collab`;
}

/** Accepts `wss://host/collab`, `https://host/collab`, or a bare `host:port` (→ `/collab`). */
function normalizeServerUrl(serverUrl: string): string {
  const url = serverUrl.trim();
  if (/^wss?:\/\//i.test(url)) return url;
  if (/^https?:\/\//i.test(url)) return url.replace(/^http/i, "ws");
  const secure = typeof location !== "undefined" && location.protocol === "https:";
  const withPath = url.includes("/") ? url : `${url}/collab`;
  return `${secure ? "wss" : "ws"}://${withPath}`;
}

function textKey(tabId: string) {
  return `tab-query-${tabId}`;
}

function waitForSync(provider: WebsocketProviderType, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (provider.synced) return resolve();
    const done = (err?: Error) => {
      clearTimeout(timer);
      provider.off("sync", onSync);
      provider.off("closed", onClosed);
      if (err) reject(err);
      else resolve();
    };
    const onSync = (synced: boolean) => {
      if (synced) done();
    };
    const onClosed = (event: { code: number; reason: string }) =>
      done(new Error(`Collaboration server at ${url} refused the connection (${event.code} ${event.reason})`));
    const timer = setTimeout(
      () =>
        done(
          new Error(
            `Could not connect to the collaboration server at ${url} (no response within ${CONNECT_TIMEOUT_MS / 1000}s)`
          )
        ),
      CONNECT_TIMEOUT_MS
    );
    provider.on("sync", onSync);
    provider.on("closed", onClosed);
  });
}

/**
 * Connect to a collaboration room via the self-hosted Yjs relay (y-websocket protocol).
 * Resolves once the connection is open and the initial document sync has completed;
 * rejects (and cleans up) after ~8s if the relay is unreachable.
 * Yjs/y-websocket are imported dynamically to keep them out of the main bundle.
 */
export async function connectToRoom(roomId: string, serverUrl: string = defaultCollabUrl()) {
  if (useCollaborationStore.getState().provider) disconnectFromRoom();

  const collab = useCollaborationStore.getState();
  collab.setConnecting(true);
  collab.setError(null);

  const url = normalizeServerUrl(serverUrl);
  const Y = await import("yjs");
  const { WebsocketProvider } = await import("y-websocket");

  const ydoc = new Y.Doc();
  const provider = new WebsocketProvider(url, roomId, ydoc);
  provider.awareness.setLocalStateField("peer", collab.localPeer);

  try {
    await waitForSync(provider, url);
  } catch (err) {
    provider.destroy();
    ydoc.destroy();
    useCollaborationStore.getState().reset();
    useCollaborationStore.getState().setError(err instanceof Error ? err.message : String(err));
    throw err;
  }

  collab.setYDoc(ydoc);
  collab.setProvider(provider);
  collab.setRoom(roomId);

  // Peers (awareness)
  const awareness = provider.awareness;
  const onAwarenessChange = () => {
    const peers: PeerInfo[] = [];
    awareness.getStates().forEach((state, clientId) => {
      if (clientId !== awareness.clientID && state.peer) peers.push(state.peer as PeerInfo);
    });
    useCollaborationStore.getState().setRemotePeers(peers);
  };
  awareness.on("change", onAwarenessChange);
  onAwarenessChange();

  const onStatus = ({ status }: { status: string }) =>
    useCollaborationStore.getState().setConnected(status === "connected");
  provider.on("status", onStatus);

  // Tabs: adopt the room's tabs if it has any, otherwise publish ours.
  const yTabs = ydoc.getArray<YTabMeta>("tabs");
  if (yTabs.length > 0) {
    applyRemoteTabs(ydoc);
  } else {
    ydoc.transact(() => pushTabList(ydoc, useWorkspaceStore.getState().tabs), LOCAL_ORIGIN);
  }
  const textObservers = new Map<string, () => void>();
  syncTextObservers(ydoc, textObservers);

  // Y → store (tab list)
  const onYTabs = (event: Yjs.YArrayEvent<YTabMeta>) => {
    if (event.transaction.origin === LOCAL_ORIGIN) return;
    applyRemoteTabs(ydoc);
    syncTextObservers(ydoc, textObservers);
  };
  yTabs.observe(onYTabs);

  // Store → Y. Tab list/titles are pushed immediately (only when they changed).
  // Query text is pushed in a microtask so the y-monaco binding (which writes the
  // bound tab's Y.Text from the same Monaco change event) runs first; by then the
  // texts match and nothing is double-applied.
  const pendingText = new Set<string>();
  const unsubscribeStore = useWorkspaceStore.subscribe((state, prev) => {
    if (applyingRemote || state.tabs === prev.tabs) return;
    if (!sameMeta(yTabs.toArray(), state.tabs)) {
      ydoc.transact(() => pushTabList(ydoc, state.tabs), LOCAL_ORIGIN);
    }
    syncTextObservers(ydoc, textObservers);

    const prevById = new Map(prev.tabs.map((t) => [t.id, t]));
    const hadPending = pendingText.size > 0;
    for (const tab of state.tabs) {
      if (prevById.get(tab.id)?.query !== tab.query) pendingText.add(tab.id);
    }
    if (hadPending || pendingText.size === 0) return;
    queueMicrotask(() => {
      if (useCollaborationStore.getState().ydoc !== ydoc) return;
      const tabs = useWorkspaceStore.getState().tabs;
      ydoc.transact(() => {
        for (const id of pendingText) {
          const tab = tabs.find((t) => t.id === id);
          if (tab) applyTextDiff(ydoc.getText(textKey(id)), tab.query);
        }
      }, LOCAL_ORIGIN);
      pendingText.clear();
    });
  });

  // Files: publish local files and load the room's files automatically.
  startFileSync();

  cleanups = [
    unsubscribeStore,
    () => yTabs.unobserve(onYTabs),
    () => {
      textObservers.forEach((unobserve) => unobserve());
      textObservers.clear();
    },
    () => awareness.off("change", onAwarenessChange),
    () => provider.off("status", onStatus),
    stopFileSync,
  ];

  const ready = useCollaborationStore.getState();
  ready.setConnecting(false);
  ready.setConnected(provider.wsconnected);
}

export function disconnectFromRoom() {
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
  const { provider, ydoc } = useCollaborationStore.getState();
  provider?.destroy();
  ydoc?.destroy();
  useCollaborationStore.getState().reset();
}

function withRemote(fn: () => void) {
  applyingRemote = true;
  try {
    fn();
  } finally {
    applyingRemote = false;
  }
}

function sameMeta(meta: YTabMeta[], tabs: EditorTab[]): boolean {
  return (
    meta.length === tabs.length &&
    meta.every((m, i) => m.id === tabs[i].id && m.title === tabs[i].title)
  );
}

/** Minimal edit of the Y "tabs" array so it matches the local tab list. Call inside a transaction. */
function pushTabList(ydoc: Yjs.Doc, tabs: EditorTab[]) {
  const yTabs = ydoc.getArray<YTabMeta>("tabs");
  const wanted = new Map(tabs.map((t) => [t.id, t]));
  const current = yTabs.toArray();

  for (let i = current.length - 1; i >= 0; i--) {
    const tab = wanted.get(current[i].id);
    if (!tab) {
      yTabs.delete(i, 1);
    } else if (tab.title !== current[i].title) {
      yTabs.delete(i, 1);
      yTabs.insert(i, [{ id: tab.id, title: tab.title, createdAt: tab.createdAt }]);
    }
  }

  const present = new Set(current.map((m) => m.id));
  tabs.forEach((tab, index) => {
    if (present.has(tab.id)) return;
    yTabs.insert(Math.min(index, yTabs.length), [
      { id: tab.id, title: tab.title, createdAt: tab.createdAt },
    ]);
    const yText = ydoc.getText(textKey(tab.id));
    if (yText.length === 0 && tab.query) yText.insert(0, tab.query);
  });
}

/** Apply the room's tab list to the store, keeping local results/errors and the active tab. */
function applyRemoteTabs(ydoc: Yjs.Doc) {
  const seen = new Set<string>();
  const remote = ydoc
    .getArray<YTabMeta>("tabs")
    .toArray()
    .filter((m) => !seen.has(m.id) && seen.add(m.id));
  if (remote.length === 0) return;

  const { tabs, activeTabId } = useWorkspaceStore.getState();
  const localById = new Map(tabs.map((t) => [t.id, t]));
  const next: EditorTab[] = remote.map((meta) => {
    const query = ydoc.getText(textKey(meta.id)).toString();
    const local = localById.get(meta.id);
    if (local) {
      return local.title === meta.title && local.query === query
        ? local
        : { ...local, title: meta.title, query };
    }
    return {
      id: meta.id,
      title: meta.title,
      query,
      result: null,
      error: null,
      isExecuting: false,
      createdAt: meta.createdAt,
    };
  });

  const nextActive = next.some((t) => t.id === activeTabId) ? activeTabId : next[0].id;
  const unchanged =
    next.length === tabs.length && next.every((t, i) => t === tabs[i]) && nextActive === activeTabId;
  if (unchanged) return;
  withRemote(() => useWorkspaceStore.setState({ tabs: next, activeTabId: nextActive }));
}

/** Observe each tab's Y.Text so remote edits reach the store even for tabs not bound to Monaco. */
function syncTextObservers(ydoc: Yjs.Doc, observers: Map<string, () => void>) {
  const ids = new Set(useWorkspaceStore.getState().tabs.map((t) => t.id));
  for (const [id, unobserve] of observers) {
    if (!ids.has(id)) {
      unobserve();
      observers.delete(id);
    }
  }
  for (const id of ids) {
    if (observers.has(id)) continue;
    const yText = ydoc.getText(textKey(id));
    const handler = (event: Yjs.YTextEvent) => {
      if (event.transaction.origin === LOCAL_ORIGIN) return;
      const text = yText.toString();
      const { tabs } = useWorkspaceStore.getState();
      const tab = tabs.find((t) => t.id === id);
      if (!tab || tab.query === text) return;
      withRemote(() =>
        useWorkspaceStore.setState({
          tabs: tabs.map((t) => (t.id === id ? { ...t, query: text } : t)),
        })
      );
    };
    yText.observe(handler);
    observers.set(id, () => yText.unobserve(handler));
  }
}

/** Replace the differing middle section of a Y.Text so it equals `next`. */
function applyTextDiff(yText: Yjs.Text, next: string) {
  const current = yText.toString();
  if (current === next) return;
  let start = 0;
  while (start < current.length && start < next.length && current[start] === next[start]) start++;
  let endCurrent = current.length;
  let endNext = next.length;
  while (endCurrent > start && endNext > start && current[endCurrent - 1] === next[endNext - 1]) {
    endCurrent--;
    endNext--;
  }
  if (endCurrent > start) yText.delete(start, endCurrent - start);
  if (endNext > start) yText.insert(start, next.slice(start, endNext));
}

/**
 * Get Y.Text for a specific tab's query, used by MonacoBinding.
 */
export function getYTextForTab(tabId: string): Yjs.Text | null {
  const { ydoc } = useCollaborationStore.getState();
  if (!ydoc) return null;
  return (ydoc as Yjs.Doc).getText(textKey(tabId));
}

/**
 * Get the awareness instance from the provider.
 */
export function getAwareness(): WebsocketProviderType["awareness"] | null {
  const { provider } = useCollaborationStore.getState();
  return (provider as WebsocketProviderType | null)?.awareness ?? null;
}
