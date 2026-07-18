export type WebSocketFrameType =
  | 'subscribe'
  | 'unsubscribe'
  | 'message'
  | 'abort'
  | 'subscribed'
  | 'chunk'
  | 'done'
  | 'error';

export interface WebSocketFrame<TPayload = unknown> {
  channel: string;
  type: WebSocketFrameType;
  payload?: TPayload;
}

type FrameListener = (frame: WebSocketFrame) => void;

const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 15_000;

// Module-level singleton: one socket for the whole app, shared across every
// caller of useWebSocketChannel(). Deliberately kept outside Vue reactivity;
// nothing here needs to trigger a re-render.
let socket: WebSocket | null = null;
let connecting = false;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const channelListeners = new Map<string, Set<FrameListener>>();
const outgoingQueue: WebSocketFrame[] = [];

function isWebSocketFrame(value: unknown): value is WebSocketFrame {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as WebSocketFrame).channel === 'string' &&
    typeof (value as WebSocketFrame).type === 'string'
  );
}

function getWebSocketUrl(): string {
  const { public: publicConfig } = useRuntimeConfig();
  return `${publicConfig.apiBaseUrl.replace(/^http/, 'ws')}/ws`;
}

function sendNow(frame: WebSocketFrame) {
  socket?.send(JSON.stringify(frame));
}

function flushQueue() {
  while (outgoingQueue.length > 0) {
    const frame = outgoingQueue.shift();
    if (frame) sendNow(frame);
  }
}

/** Re-sends a `subscribe` for every channel that still has listeners. */
function resubscribeAll() {
  for (const channel of channelListeners.keys()) {
    sendNow({ channel, type: 'subscribe' });
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;

  const delay = Math.min(
    RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempts,
    RECONNECT_MAX_DELAY_MS,
  );
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function handleMessage(event: MessageEvent) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(event.data);
  } catch {
    return; // malformed frame, ignore
  }
  if (!isWebSocketFrame(parsed)) return;

  // Frames for a channel with no active listener are dropped silently.
  // Multi-tab chunk application is explicitly out of scope for phase 1.
  const listeners = channelListeners.get(parsed.channel);
  if (!listeners) return;
  for (const listener of listeners) listener(parsed);
}

function handleOpen() {
  connecting = false;
  reconnectAttempts = 0;
  resubscribeAll();
  flushQueue();
}

function handleClose() {
  connecting = false;
  socket = null;
  scheduleReconnect();
}

function connect() {
  // A reconnect is already scheduled or in flight; let it run its course
  // instead of racing it with a second socket.
  if (socket || connecting || reconnectTimer) return;

  connecting = true;
  const ws = new WebSocket(getWebSocketUrl());
  ws.addEventListener('open', handleOpen);
  ws.addEventListener('message', handleMessage);
  ws.addEventListener('close', handleClose);
  // A socket-level error is always followed by a close event; handleClose
  // owns the reconnect so it only fires once per drop.
  ws.addEventListener('error', () => ws.close());
  socket = ws;
}

function sendOrQueue(frame: WebSocketFrame) {
  connect();
  if (socket?.readyState === WebSocket.OPEN) {
    sendNow(frame);
  } else {
    outgoingQueue.push(frame);
  }
}

/**
 * One shared WebSocket connection for the whole app, multiplexed by channel.
 *
 * Connects lazily on first `subscribe`/`send` call, reconnects with
 * exponential backoff, re-subscribes every channel that still has listeners
 * after a reconnect, and queues outgoing frames while disconnected.
 */
export function useWebSocketChannel() {
  /** Subscribes to a channel; returns an unsubscribe function. */
  function subscribe(channel: string, onFrame: FrameListener): () => void {
    connect();

    let listeners = channelListeners.get(channel);
    if (!listeners) {
      listeners = new Set();
      channelListeners.set(channel, listeners);
      // If we're not connected yet, handleOpen()'s resubscribeAll() will
      // pick this channel up once the socket opens.
      if (socket?.readyState === WebSocket.OPEN) {
        sendNow({ channel, type: 'subscribe' });
      }
    }
    listeners.add(onFrame);

    return () => {
      listeners.delete(onFrame);
      if (listeners.size === 0) {
        channelListeners.delete(channel);
        sendOrQueue({ channel, type: 'unsubscribe' });
      }
    };
  }

  function send(frame: WebSocketFrame) {
    sendOrQueue(frame);
  }

  return { subscribe, send };
}
