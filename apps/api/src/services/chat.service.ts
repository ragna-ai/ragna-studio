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
import type { Chat } from '@repo/database';
import {
  createChat,
  deleteChatByWorkspaceId,
  getChatByIdForUser,
  getChatByIdForWorkspace,
  getChatCountByWorkspaceId,
  getChatsByWorkspaceId,
  getOrCreateDefaultAgentForUser,
  updateChatTitleById,
  updateChatTitleByWorkspaceId,
} from '@repo/database';
import { logger } from '@repo/logger';
import { createPrimaryId, tryCatch } from '@repo/utils';
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '../exceptions';

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

export interface ChatDetailResponse {
  id: string;
  agentId: string;
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
    agentId: chatRecord.agentId,
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
    createChat({ userId, agentId: resolvedAgentId, title: 'New Chat', workspaceId }),
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
