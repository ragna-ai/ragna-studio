import type { UIMessage } from '@repo/ai';
import {
  buildAgentInstructions,
  buildAgentToolset,
  convertToModelMessages,
  createUIMessageStream,
  generateText,
  getLanguageModel,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
  toModelSettings,
  toUIMessageStream,
} from '@repo/ai';
import { getChatByIdForUser, updateChatTitleById, upsertChatMessages } from '@repo/database';
import { logger } from '@repo/logger';
import { createPrimaryId, tryCatch } from '@repo/utils';
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '../exceptions';

const chatTitleGeneratorPrompt = `As a chat title generator your task is to create a short chat title based on the provided text.\n
  You always only respond with the chat title in plain text in the users language.\n
  The title should be concise, descriptive, and relevant to the content of the message.\n
  Avoid using any special characters, markdown, or punctuation marks at the beginning or end of the title.\n
  Keep the title under 10 words if possible.`;

export async function generateChatTitle({ uiMessage }: { uiMessage: UIMessage }) {
  //
  const messageText = uiMessage.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join(' ')
    .trim();

  try {
    const { text } = await generateText({
      model: getLanguageModel({
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
      }),
      instructions: chatTitleGeneratorPrompt,
      messages: [{ role: 'user', content: messageText }],
      maxOutputTokens: 20,
    });

    const title = text.trim().replace(/(^"|"$)/g, '');

    logger.debug(`Generated chat title: ${title}`);

    return title;
    //
  } catch (error) {
    logger.error('Error generating chat title', error);
    throw new InternalServerErrorException('Failed to generate chat title');
  }
}

// Derived from `createUIMessageStream`'s own return type instead of naming
// `UIMessageChunk` from the `ai` package directly, since apps/api only
// depends on `@repo/ai`, not `ai` itself.
type ChatStreamChunk =
  ReturnType<typeof createUIMessageStream> extends ReadableStream<infer Chunk> ? Chunk : never;

export type ChatStreamChunkSink = (chunk: ChatStreamChunk) => void;

export type RunChatStreamParams = {
  chatId: string;
  userId: string;
  messages: unknown[];
  // Accepted for parity with the client payload (mirrors the AI SDK's
  // regenerate request shape); unused today because, same as the HTTP
  // endpoint this replaces, the trimmed `messages` array alone determines
  // what gets (re)generated.
  trigger?: string;
  messageId?: string;
};

// One in-flight run per chat: `abortChatRun` looks a chat up here to cancel it.
const inFlightRunsByChatId = new Map<string, AbortController>();

export function abortChatRun(chatId: string): boolean {
  const controller = inFlightRunsByChatId.get(chatId);
  if (!controller) {
    return false;
  }

  controller.abort();
  return true;
}

/**
 * Runs the full chat streaming pipeline for one turn: validates the
 * incoming messages, builds agent instructions, generates a title for new
 * chats, streams the model response, and persists the result. Every chunk
 * of the resulting UIMessage stream is handed to `onChunk` as it arrives;
 * this is transport-agnostic (the WS chat handler publishes each chunk on
 * `chat:<chatId>`, and previously the HTTP route piped it straight to the
 * response).
 */
export async function runChatStream(
  { chatId, userId, messages }: RunChatStreamParams,
  onChunk: ChatStreamChunkSink,
): Promise<void> {
  if (inFlightRunsByChatId.has(chatId)) {
    throw new ConflictException('A response is already generating for this chat');
  }

  // Reserve the slot synchronously, right next to the check above and before
  // any `await`. Everything below this point is async (DB fetch, message
  // validation, ...), so without reserving the slot first, two `message`
  // frames for the same chat arriving back to back could both pass the
  // check above while the first is still validating.
  const abortController = new AbortController();
  inFlightRunsByChatId.set(chatId, abortController);

  try {
    const { error: userChatError, data: userChat } = await tryCatch(() =>
      getChatByIdForUser({ chatId, userId }),
    );

    if (userChatError !== null) {
      throw new InternalServerErrorException('Failed to fetch chat');
    }

    if (!userChat) {
      throw new NotFoundException('Chat not found');
    }

    const validated = await safeValidateUIMessages({ messages });

    if (!validated.success) {
      logger.warn(`Invalid messages for chat ${chatId}`, validated.error);
      throw new BadRequestException('Invalid messages format');
    }

    const { agent } = userChat;

    const validUiMessages = validated.data;
    const modelMessages = await convertToModelMessages(validUiMessages);
    const instructions = await buildAgentInstructions({
      agentId: agent.id,
      userId,
      tools: agent.tools,
      systemPrompt: agent.systemPrompt,
      context: agent.context,
      defaultDatasetId: agent.defaultDatasetId,
    });

    const lastUiMessage = validUiMessages.at(-1);

    let titlePromise: Promise<string> | null = null;
    if (userChat.messages.length === 0 && lastUiMessage?.role === 'user') {
      titlePromise = generateChatTitle({ uiMessage: lastUiMessage });
    }

    logger.debug(`Processing messages for chat ${chatId}`, { messages: validUiMessages });

    const stream = createUIMessageStream({
      originalMessages: validUiMessages,
      execute: ({ writer: dataStream }) => {
        // Handle title generation in parallel
        if (titlePromise) {
          titlePromise.then((title) => {
            updateChatTitleById({ chatId: userChat.id, userId, title });
            dataStream.write({
              type: 'data-chat-title',
              data: { title },
              transient: true, // no history
            });
          });
        }

        // Stream the response from the language model
        const result = streamText({
          abortSignal: abortController.signal,
          timeout: {
            totalMs: 600_000, // whole multi-step run; image tools can take minutes
            toolMs: 180_000, // single tool call (e.g. generating up to 4 images)
          },
          model: getLanguageModel({
            provider: agent.aiModel.provider,
            model: agent.aiModel.model,
          }),
          instructions,
          messages: modelMessages,
          tools: buildAgentToolset(agent.tools, dataStream, {
            userId,
            agentId: agent.id,
            workspaceId: userChat.workspaceId,
          }),
          stopWhen: stepCountIs(5),
          ...toModelSettings(agent.settings),
          onStart(st) {
            logger.debug('Request started', {
              callId: st.callId,
              modelId: st.modelId,
              runtimeContext: st.runtimeContext,
              instructions: st.instructions,
            });
          },
          onEnd(res) {
            logger.debug('Request finished', {
              callId: res.callId,
              finishReason: res.finishReason,
              usage: res.usage,
            });
          },
          onAbort() {
            logger.warn('Request aborted by user');
          },
          onError(error) {
            logger.error('Error in chat stream', error);
          },
        });

        // result.consumeStream(); // consume stream even if user has disconnected/aborted

        dataStream.merge(
          toUIMessageStream({
            stream: result.stream,
            generateMessageId: createPrimaryId,
            sendReasoning: true,
          }),
        );
      },
      async onEnd({ responseMessage, isAborted, finishReason }) {
        if (isAborted || finishReason === 'error') {
          return;
        }

        // Persist the new user message and the assistant response as UIMessages.
        // Upsert by message id so retries and regenerations replace instead of duplicate.

        const messagesToSave =
          lastUiMessage?.role === 'user' ? [lastUiMessage, responseMessage] : [responseMessage];

        const { error } = await tryCatch(() =>
          upsertChatMessages(
            messagesToSave.map((message) => ({
              id: message.id,
              chatId: userChat.id,
              role: message.role,
              parts: message.parts,
              metadata: message.metadata ?? null,
            })),
          ),
        );

        if (error !== null) {
          logger.error(`Failed to persist messages for chat ${userChat.id}`, error);
        }
      },
    });

    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      onChunk(value);
    }
  } finally {
    inFlightRunsByChatId.delete(chatId);
  }
}
