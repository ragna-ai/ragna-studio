import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import { useWebSocketChannel } from '~/composables/useWebSocketChannel';

interface ChatMessageFramePayload {
  message: UIMessage;
}

interface ChatErrorFramePayload {
  code: string;
  message: string;
}

type SendMessagesOptions = Parameters<
  ChatTransport<UIMessage>['sendMessages']
>[0];
type ReconnectToStreamOptions = Parameters<
  ChatTransport<UIMessage>['reconnectToStream']
>[0];

/**
 * `ChatTransport` that streams `useChat` over the shared WebSocket channel
 * `chat:<chatId>` instead of an HTTP POST (docs/team-chat/prd.md, phase 1).
 *
 * `useChat` passes its own internal chat-instance id into `sendMessages`
 * (a `generateId()` result, since `ChatConversation.vue` never passes an
 * explicit `id` to `useChat`) — that id is unrelated to the app's actual
 * chat id. This transport is constructed with a `getChatId` callback that
 * reads the real id from the component instead of trusting that field.
 */
export class WebSocketChatTransport implements ChatTransport<UIMessage> {
  constructor(private readonly getChatId: () => string | null) {}

  async sendMessages({
    messages,
    abortSignal,
  }: SendMessagesOptions): Promise<ReadableStream<UIMessageChunk>> {
    const chatId = this.getChatId();
    if (!chatId) {
      throw new Error(
        'WebSocketChatTransport: no chat id available to send messages',
      );
    }

    // The server rebuilds the rest of the conversation from its own
    // persisted history, so only the newest message needs to go over the
    // wire (docs/team-chat/prd.md).
    const message = messages.at(-1);
    if (!message) {
      throw new Error('WebSocketChatTransport: no message to send');
    }

    const channel = `chat:${chatId}`;
    const { subscribe, send } = useWebSocketChannel();

    let streamController: ReadableStreamDefaultController<UIMessageChunk> | null =
      null;
    const stream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        streamController = controller;
      },
    });

    // Guards against acting twice on the stream (e.g. a `done` frame racing
    // an in-flight `abort`) once either side has already terminated it.
    let finished = false;
    let settleAck: ((error?: Error) => void) | null = null;
    let unsubscribe: (() => void) | null = null;

    const finish = () => {
      finished = true;
      unsubscribe?.();
    };

    unsubscribe = subscribe(channel, (frame) => {
      switch (frame.type) {
        case 'subscribed':
          settleAck?.();
          settleAck = null;
          break;
        case 'chunk':
          streamController?.enqueue(frame.payload as UIMessageChunk);
          break;
        case 'done':
          streamController?.close();
          finish();
          break;
        case 'error': {
          const payload = frame.payload as ChatErrorFramePayload | undefined;
          const error = new Error(payload?.message ?? 'Chat stream error');
          settleAck?.(error);
          settleAck = null;
          streamController?.error(error);
          finish();
          break;
        }
      }
    });

    const onAbort = () => {
      if (finished) return;
      send({ channel, type: 'abort' });
      settleAck?.(new DOMException('Aborted', 'AbortError'));
      settleAck = null;
      streamController?.close();
      finish();
    };
    abortSignal?.addEventListener('abort', onAbort, { once: true });
    if (abortSignal?.aborted) onAbort();

    // Wait for the server to ack the subscribe before sending the message,
    // so the `message` frame is never dropped for an unauthorized/unknown
    // channel.
    await new Promise<void>((resolve, reject) => {
      settleAck = (error) => (error ? reject(error) : resolve());
    });

    send({
      channel,
      type: 'message',
      payload: { message } satisfies ChatMessageFramePayload,
    });

    return stream;
  }

  async reconnectToStream(
    _options: ReconnectToStreamOptions,
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    // Resumable streams are deferred until the server-side chunk buffer
    // lands (docs/team-chat/prd.md, "Later (explicitly deferred)").
    return null;
  }
}
