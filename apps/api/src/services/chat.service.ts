import type { UIMessage } from '@repo/ai';
import {
  buildAgentInstructions,
  buildAgentToolset,
  convertToModelMessages,
  createUIMessageStream,
  generateText,
  getLanguageModel,
  normalizeUsage,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
  toModelSettings,
  toUIMessageStream,
} from '@repo/ai';
import type { Chat } from '@repo/database';
import {
  createChat,
  deleteChatByWorkspaceId,
  getChatByIdForUser,
  getChatByIdForWorkspace,
  getChatCountByWorkspaceId,
  getChatsByWorkspaceId,
  getOrCreateDefaultAgentForUser,
  settleCreditUsage,
  updateChatTitleById,
  updateChatTitleByWorkspaceId,
  upsertChatMessages,
} from '@repo/database';
import { logger } from '@repo/logger';
import { createPrimaryId, tryCatch } from '@repo/utils';
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '../exceptions';
import { assertCanSpend } from './credit.service';

// CHAT CRUD (docs/api-standards/prd.md, WP4)
//
// Every function below is called after the workspace guard has already
// verified the caller owns `:workspaceId`; access is scoped by workspaceId,
// never by userId. `userId` is only stamped on create as authorship
// metadata. This is distinct from the streaming pipeline further down,
// which predates the guard and still checks ownership via userId.

export interface ChatSummaryResponse {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  agent: {
    id: string;
    name: string;
    aiModel: {
      id: string;
      provider: string;
      displayName: string;
    };
  };
}

export interface ChatListResponse {
  chats: ChatSummaryResponse[];
  totalCount: number;
}

/**
 * [GET] /workspace/:workspaceId/chat
 * Lists a workspace's chats, paginated and sorted by createdAt.
 */
export async function listChatsForWorkspace({
  workspaceId,
  page,
  limit,
  sort,
}: {
  workspaceId: string;
  page: number;
  limit: number;
  sort: 'asc' | 'desc';
}): Promise<ChatListResponse> {
  const offset = (page - 1) * limit;

  const { error: countError, data: totalCount } = await tryCatch(() =>
    getChatCountByWorkspaceId({ workspaceId }),
  );

  if (countError !== null || totalCount === null) {
    logger.error(`Error counting chats for workspace ${workspaceId}`, countError);
    throw new InternalServerErrorException('Failed to count chats');
  }

  const { error, data: chats } = await tryCatch(() =>
    getChatsByWorkspaceId({ workspaceId, limit, offset, sort }),
  );

  if (error !== null || !chats) {
    logger.error(`Error listing chats for workspace ${workspaceId}`, error);
    throw new InternalServerErrorException('Failed to list chats');
  }

  return {
    chats: chats.map((chatRecord) => ({
      id: chatRecord.id,
      title: chatRecord.title,
      createdAt: chatRecord.createdAt,
      updatedAt: chatRecord.updatedAt,
      agent: {
        id: chatRecord.agent.id,
        name: chatRecord.agent.name,
        aiModel: {
          id: chatRecord.agent.aiModel.id,
          provider: chatRecord.agent.aiModel.provider,
          displayName: chatRecord.agent.aiModel.displayName,
        },
      },
    })),
    totalCount,
  };
}

export interface ChatMessageResponse {
  id: string;
  role: string;
  parts: unknown[];
  metadata?: Record<string, unknown>;
}

export interface ChatAgentResponse {
  id: string;
  name: string;
  aiModel: {
    id: string;
    provider: string;
    displayName: string;
  };
}

export interface ChatDetailResponse {
  id: string;
  agent: ChatAgentResponse;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: ChatMessageResponse[] | null;
}

/**
 * [GET] /workspace/:workspaceId/chat/:chatId
 */
export async function getChatForWorkspace({
  workspaceId,
  chatId,
}: {
  workspaceId: string;
  chatId: string;
}): Promise<ChatDetailResponse> {
  const { error, data: chatRecord } = await tryCatch(() =>
    getChatByIdForWorkspace({ chatId, workspaceId }),
  );

  if (error !== null) {
    logger.error(`Error fetching chat ${chatId}`, error);
    throw new InternalServerErrorException('Failed to fetch chat');
  }

  if (!chatRecord) {
    throw new NotFoundException('Chat not found');
  }

  // Return stored messages strictly UIMessage-shaped ({ id, role, parts,
  // metadata? }) so the client can feed them into useChat as-is.
  const messages = chatRecord.messages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: message.parts,
    metadata: message.metadata ?? undefined,
  }));

  return {
    id: chatRecord.id,
    agent: {
      id: chatRecord.agent.id,
      name: chatRecord.agent.name,
      aiModel: {
        id: chatRecord.agent.aiModel.id,
        provider: chatRecord.agent.aiModel.provider,
        displayName: chatRecord.agent.aiModel.displayName,
      },
    },
    title: chatRecord.title,
    createdAt: chatRecord.createdAt,
    updatedAt: chatRecord.updatedAt,
    messages: messages.length ? messages : null,
  };
}

async function resolveDefaultAgentId({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}): Promise<string> {
  const { error, data: agent } = await tryCatch(() =>
    getOrCreateDefaultAgentForUser({ userId, workspaceId }),
  );

  if (error !== null || !agent) {
    logger.error(`Error fetching default agent for user ${userId}`, error);
    throw new InternalServerErrorException('Failed to fetch default agent');
  }

  return agent.id;
}

/**
 * [POST] /workspace/:workspaceId/chat
 * Creates a chat, defaulting to the workspace's default agent when no
 * agentId is given.
 */
export async function createChatForWorkspace({
  workspaceId,
  userId,
  agentId,
}: {
  workspaceId: string;
  userId: string;
  agentId?: string;
}): Promise<Chat> {
  const resolvedAgentId = agentId ?? (await resolveDefaultAgentId({ workspaceId, userId }));

  const { error, data: chatRecord } = await tryCatch(() =>
    createChat({ userId, agentId: resolvedAgentId, title: 'Chat', workspaceId }),
  );

  if (error !== null || !chatRecord) {
    logger.error(`Error creating chat for user ${userId}`, error);
    throw new InternalServerErrorException('Failed to create chat');
  }

  return chatRecord;
}

/**
 * [PATCH] /workspace/:workspaceId/chat/:chatId
 */
export async function renameChatForWorkspace({
  workspaceId,
  chatId,
  title,
}: {
  workspaceId: string;
  chatId: string;
  title: string;
}): Promise<Chat> {
  const { error, data: chatRecord } = await tryCatch(() =>
    updateChatTitleByWorkspaceId({ chatId, workspaceId, title }),
  );

  if (error !== null) {
    logger.error(`Error renaming chat ${chatId}`, error);
    throw new InternalServerErrorException('Failed to rename chat');
  }

  if (!chatRecord) {
    throw new NotFoundException('Chat not found');
  }

  return chatRecord;
}

/**
 * [DELETE] /workspace/:workspaceId/chat/:chatId
 */
export async function deleteChatForWorkspace({
  workspaceId,
  chatId,
}: {
  workspaceId: string;
  chatId: string;
}): Promise<void> {
  const { error } = await tryCatch(() => deleteChatByWorkspaceId({ chatId, workspaceId }));

  if (error !== null) {
    logger.error(`Error deleting chat ${chatId}`, error);
    throw new InternalServerErrorException('Failed to delete chat');
  }
}

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
  // Only the newest UIMessage; the rest of the conversation is rebuilt from
  // `userChat.messages` (the persisted history) below.
  message: unknown;
};

// A turn that errored or was aborted persists its user message but no
// assistant response, so history can contain consecutive user messages.
// Providers like Anthropic and Google reject non-alternating turns, so each
// run of user messages is collapsed into one message with the parts
// concatenated. Only the model-facing view is merged; the persisted rows and
// the UI keep the messages separate.
function mergeConsecutiveUserMessages(messages: UIMessage[]): UIMessage[] {
  const merged: UIMessage[] = [];

  for (const message of messages) {
    const previous = merged.at(-1);

    if (message.role === 'user' && previous?.role === 'user') {
      merged[merged.length - 1] = { ...previous, parts: [...previous.parts, ...message.parts] };
      continue;
    }

    merged.push(message);
  }

  return merged;
}

function toChatMessageRow(message: UIMessage, chatId: string) {
  return {
    id: message.id,
    chatId,
    role: message.role,
    parts: message.parts,
    metadata: message.metadata ?? null,
  };
}

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
  { chatId, userId, message }: RunChatStreamParams,
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

    const { agent } = userChat;

    // Refuse before any model call happens if the workspace owner is out of
    // credits, or if the chat's model has no chargeable pricing
    // (docs/credits/prd.md, "The WS chat path" and "Pricing"). Throws
    // PaymentRequiredException or InternalServerErrorException, which
    // ws.controller.ts already maps to an error frame. `null` means
    // CREDITS_ENABLED is off; settlement in streamText's onEnd below is
    // skipped together with this gate.
    const creditSpendState = await assertCanSpend({
      workspaceId: userChat.workspaceId,
      pricing: agent.aiModel.pricing,
    });

    // Rebuild the full conversation from persisted history plus the one new
    // message the client sent, rather than trusting a client-sent history.
    const validated = await safeValidateUIMessages({
      messages: [...userChat.messages, message],
    });

    if (!validated.success) {
      logger.warn(`Invalid messages for chat ${chatId}`, validated.error);
      throw new BadRequestException('Invalid messages format');
    }

    const validUiMessages = validated.data;
    const validModelMessages = await convertToModelMessages(
      mergeConsecutiveUserMessages(validUiMessages),
    );
    const { instructions, retrievalMode } = await buildAgentInstructions({
      agentId: agent.id,
      userId,
      tools: agent.tools,
      systemPrompt: agent.systemPrompt,
      context: agent.context,
      defaultDatasetId: agent.defaultDatasetId,
    });

    const lastUiMessage = validUiMessages.at(-1);

    // Persist the user message before streaming starts. `onEnd` skips
    // persistence on abort/error, and the next turn rebuilds history from the
    // DB alone, so saving it only on success would silently drop the message
    // from the conversation (docs/chat/chat-message-persistence.md).
    if (lastUiMessage?.role === 'user') {
      const { error: persistError } = await tryCatch(() =>
        upsertChatMessages([toChatMessageRow(lastUiMessage, userChat.id)]),
      );

      if (persistError !== null) {
        logger.error(`Failed to persist user message for chat ${userChat.id}`, persistError);
        throw new InternalServerErrorException('Failed to persist message');
      }
    }

    let titlePromise: Promise<string> | null = null;
    if (userChat.messages.length === 0 && lastUiMessage?.role === 'user') {
      titlePromise = generateChatTitle({ uiMessage: lastUiMessage });
    }

    logger.debug(`Processing messages for chat ${chatId}`, { messages: validUiMessages });

    const uiMessageStream = createUIMessageStream({
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

        const streamStartedAt = Date.now();
        const modelSettings = toModelSettings(agent.settings);

        const tools = buildAgentToolset(agent.tools, dataStream, {
          userId,
          agentId: agent.id,
          workspaceId: userChat.workspaceId,
          retrievalMode,
        });

        // Stream the response from the language model
        const result = streamText({
          abortSignal: abortController.signal,
          timeout: {
            totalMs: 600_000, // whole multi-step run; image tools can take minutes
            toolMs: 180_000, // single tool call (e.g. generating up to 4 images)
          },
          instructions,
          messages: validModelMessages,
          model: getLanguageModel({
            provider: agent.aiModel.provider,
            model: agent.aiModel.model,
          }),
          temperature: modelSettings.temperature,
          maxOutputTokens: modelSettings.maxOutputTokens,
          reasoning: modelSettings.reasoning,
          tools,
          stopWhen: stepCountIs(5),
          onStart(st) {
            logger.debug('Request started', {
              callId: st.callId,
              modelId: st.modelId,
              runtimeContext: st.runtimeContext,
              instructions: st.instructions,
            });
          },
          async onEnd(res) {
            logger.debug('Request finished', {
              callId: res.callId,
              finishReason: res.finishReason,
              usage: res.usage,
            });

            // No gate result means CREDITS_ENABLED is off: gating and
            // settling are always skipped together, or accounts that were
            // never checked would get charged (docs/credits/prd.md,
            // "Call sites"). A provider-side error mid-generation still
            // consumes input tokens, but V1 charges nothing for it, same as
            // the persistence onEnd below skips isAborted/'error' turns
            // (docs/credits/prd.md, "Non-goals": "Failed and aborted runs").
            if (!creditSpendState || res.finishReason === 'error') {
              return;
            }

            // Settlement must never break a finished turn: the response is
            // already streamed by then. A dropped charge is a bug to fix in
            // reconciliation, not a reason to fail a completed chat turn
            // (docs/credits/prd.md, "Settlement transaction").
            const normUsage = normalizeUsage(agent.aiModel.provider, res.steps);
            const { error: creditUsageError } = await tryCatch(() =>
              settleCreditUsage({
                userId,
                workspaceId: userChat.workspaceId,
                creditAccountId: creditSpendState.creditAccountId,
                aiModelId: agent.aiModel.id,
                feature: 'chat',
                refType: 'chat',
                refId: userChat.id,
                durationMs: Date.now() - streamStartedAt,
                idempotencyKey: `chat:${res.callId}`,
                billableInputTokens: normUsage.billableInputTokens,
                billableOutputTokens: normUsage.billableOutputTokens,
                inputTokens: normUsage.inputTokens,
                outputTokens: normUsage.outputTokens,
                reasoningTokens: normUsage.reasoningTokens,
                // noCacheInputTokens: normUsage.noCacheInputTokens,
                cacheReadTokens: normUsage.cacheReadTokens,
                cacheWriteTokens: normUsage.cacheWriteTokens,
              }),
            );

            if (creditUsageError !== null) {
              logger.error(
                `Failed to settle credit usage for chat ${userChat.id}`,
                creditUsageError,
              );
            }
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

        // The user message was already persisted before streaming; only the
        // assistant response is saved here. Upsert by message id so retries
        // replace instead of duplicate.
        const { error } = await tryCatch(() =>
          upsertChatMessages([toChatMessageRow(responseMessage, userChat.id)]),
        );

        if (error !== null) {
          logger.error(`Failed to persist messages for chat ${userChat.id}`, error);
        }
      },
    });

    // This loop only ends after `onEnd` above has resolved: the SDK awaits it
    // in the stream's flush. Releasing the in-flight slot below therefore
    // guarantees the next turn's history fetch sees this turn's persisted
    // messages (docs/chat/chat-message-persistence.md).
    for await (const uiMessageChunk of uiMessageStream) {
      onChunk(uiMessageChunk);
    }
  } finally {
    inFlightRunsByChatId.delete(chatId);
  }
}
