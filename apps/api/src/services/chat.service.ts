import type { UIMessage } from '@repo/ai';
import {
  buildAgentInstructions,
  buildAgentToolset,
  convertToModelMessages,
  createUIMessageStream,
  generateChatTitle,
  getLanguageModel,
  normalizeUsage,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
  toModelSettings,
  toUIMessageStream,
  withCachedInstructions,
  withCachedLastMessage,
  withDefaultProviderOptions,
} from '@repo/ai';
import type { Chat, ChatSearchMessageSnippet, Media } from '@repo/database';
import {
  branchChatByWorkspaceId,
  createChat,
  deleteChatByWorkspaceId,
  getChatAttachmentsByChatId,
  getChatByIdForUser,
  getChatByIdForWorkspace,
  getChatCountByWorkspaceId,
  getChatSearchMatchCount,
  getChatSearchMatchedChats,
  getChatSearchMessageSnippets,
  getChatsByWorkspaceId,
  getOrCreateDefaultAgentForUser,
  settleCreditUsage,
  updateChatTitleById,
  updateChatTitleByWorkspaceId,
  upsertChatMessages,
} from '@repo/database';
import { logger } from '@repo/logger';
import { deleteMediaIfUnreferenced } from '@repo/media';
import { downloadObjectBuffer } from '@repo/storage';
import { createPrimaryId, tryCatch } from '@repo/utils';
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '../exceptions';
import { getAgentForWorkspace } from './agent.service';
import { assertCanSpend } from './credit.service';

// CHAT CRUD
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
  // Branching provenance: set when this chat was
  // created via "Branch from here", null for an ordinary chat.
  forkedFrom: { chatId: string; title: string } | null;
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
      forkedFrom:
        chatRecord.forkedFromChatId && chatRecord.forkedFromChat
          ? { chatId: chatRecord.forkedFromChatId, title: chatRecord.forkedFromChat.title }
          : null,
    })),
    totalCount,
  };
}

export interface ChatSearchResult {
  id: string;
  title: string;
  titleMatched: boolean;
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
  messageSnippets: ChatSearchMessageSnippet[];
}

export interface ChatSearchResponse {
  results: ChatSearchResult[];
  totalCount: number;
}

/**
 * [GET] /workspace/:workspaceId/chat/search
 * Substring search (pg_trgm) across a workspace's chats: matches by title or
 * by message content. Results are one row per
 * matching chat, most-recently-matching first; each row carries up to
 * `snippetsPerChat` highlighted message excerpts, most recent first.
 */
export async function searchChatsForWorkspace({
  workspaceId,
  q,
  page,
  limit,
  snippetsPerChat,
  caseSensitive,
}: {
  workspaceId: string;
  q: string;
  page: number;
  limit: number;
  snippetsPerChat: number;
  caseSensitive: boolean;
}): Promise<ChatSearchResponse> {
  const offset = (page - 1) * limit;

  const { error: countError, data: totalCount } = await tryCatch(() =>
    getChatSearchMatchCount({ workspaceId, query: q, caseSensitive }),
  );

  if (countError !== null || totalCount === null) {
    logger.error(`Error counting chat search matches for workspace ${workspaceId}`, countError);
    throw new InternalServerErrorException('Failed to search chats');
  }

  const { error, data: matchedChats } = await tryCatch(() =>
    getChatSearchMatchedChats({ workspaceId, query: q, limit, offset, caseSensitive }),
  );

  if (error !== null || !matchedChats) {
    logger.error(`Error searching chats for workspace ${workspaceId}`, error);
    throw new InternalServerErrorException('Failed to search chats');
  }

  const results = await Promise.all(
    matchedChats.map(async (matchedChat): Promise<ChatSearchResult> => {
      const { error: snippetsError, data: messageSnippets } = await tryCatch(() =>
        getChatSearchMessageSnippets({
          chatId: matchedChat.id,
          query: q,
          limit: snippetsPerChat,
          caseSensitive,
        }),
      );

      if (snippetsError !== null || !messageSnippets) {
        logger.error(`Error fetching search snippets for chat ${matchedChat.id}`, snippetsError);
        throw new InternalServerErrorException('Failed to search chats');
      }

      return {
        id: matchedChat.id,
        title: matchedChat.title,
        titleMatched: matchedChat.titleMatched,
        updatedAt: matchedChat.updatedAt,
        agent: {
          id: matchedChat.agent.id,
          name: matchedChat.agent.name,
          aiModel: {
            id: matchedChat.agent.aiModel.id,
            provider: matchedChat.agent.aiModel.provider,
            displayName: matchedChat.agent.aiModel.displayName,
          },
        },
        messageSnippets,
      };
    }),
  );

  return { results, totalCount };
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
  if (agentId) {
    await getAgentForWorkspace({ workspaceId, agentId });
  }

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
 * [POST] /workspace/:workspaceId/chat/:chatId/branch
 * Copies chatId's messages up to and including messageId into a brand new
 * chat. The source chat is never modified.
 */
export async function branchChatForWorkspace({
  workspaceId,
  chatId,
  messageId,
}: {
  workspaceId: string;
  chatId: string;
  messageId: string;
}): Promise<Chat> {
  const { error, data: branchedChat } = await tryCatch(() =>
    branchChatByWorkspaceId({ chatId, workspaceId, messageId }),
  );

  if (error !== null) {
    logger.error(`Error branching chat ${chatId}`, error);
    throw new InternalServerErrorException('Failed to branch chat');
  }

  if (!branchedChat) {
    throw new NotFoundException('Chat or message not found');
  }

  return branchedChat;
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
 * The chat_attachment rows cascade-delete with the chat row, so their
 * mediaIds must be captured before the delete to run the refcount check
 * afterwards.
 */
export async function deleteChatForWorkspace({
  workspaceId,
  chatId,
}: {
  workspaceId: string;
  chatId: string;
}): Promise<void> {
  const { error: attachmentsError, data: attachments } = await tryCatch(() =>
    getChatAttachmentsByChatId({ chatId }),
  );

  if (attachmentsError !== null) {
    logger.error(`Failed to load attachments for chat ${chatId} before delete`, attachmentsError);
  }

  const { error } = await tryCatch(() => deleteChatByWorkspaceId({ chatId, workspaceId }));

  if (error !== null) {
    logger.error(`Error deleting chat ${chatId}`, error);
    throw new InternalServerErrorException('Failed to delete chat');
  }

  const mediaIds = new Set((attachments ?? []).map((attachment) => attachment.mediaId));
  for (const mediaId of mediaIds) {
    await deleteMediaIfUnreferenced({ mediaId });
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

// CHAT ATTACHMENT MODEL RESOLUTION
//
// File parts carry URLs the client got back from the upload/download routes.
// The persisted UIMessage rows always keep those original parts unchanged,
// so message history renders the same chips/images it always has; only the
// copy handed to convertToModelMessages below is transformed:
//   - image parts pass through untouched (the public CDN URL is
//     model-fetchable directly);
//   - pdf parts are re-downloaded from the private documents bucket and
//     inlined as a base64 data URL, since no URL would work for the model;
//   - docx/pptx/xlsx/csv/txt/md parts are replaced with a text part holding
//     the extraction done at upload time (mimeType-driven, not a hand-listed
//     kind set, so a newly extractable document kind needs no change here);
//   - a file part whose mediaId isn't among the chat's current attachments
//     (e.g. removed since) is dropped instead of sent to the model broken.

type UIMessagePartLike = UIMessage['parts'][number];
type FilePartLike = Extract<UIMessagePartLike, { type: 'file' }>;

const MEDIA_DOWNLOAD_URL_PATTERN = /\/media\/([^/]+)\/download/;

function extractMediaIdFromDownloadUrl(url: string): string | null {
  return MEDIA_DOWNLOAD_URL_PATTERN.exec(url)?.[1] ?? null;
}

function toExtractedTextPart(part: FilePartLike, media: Media): UIMessagePartLike {
  const filename = part.filename ?? media.filename;

  return {
    type: 'text',
    text: `<attached-file name="${filename}">\n${media.extractedText ?? ''}\n</attached-file>`,
  };
}

async function inlinePdfFilePart(
  part: FilePartLike,
  media: Media,
): Promise<UIMessagePartLike | null> {
  const { error, data: object } = await tryCatch(() =>
    downloadObjectBuffer(media.bucket, media.storageKey),
  );

  if (error !== null || !object) {
    logger.error(`Failed to download pdf attachment ${media.id} for model input`, error);
    return null;
  }

  return { ...part, url: `data:application/pdf;base64,${object.buffer.toString('base64')}` };
}

async function resolveModelFacingFilePart(
  part: UIMessagePartLike,
  attachmentsByMediaId: Map<string, Media>,
): Promise<UIMessagePartLike | null> {
  if (part.type !== 'file') {
    return part;
  }

  if (part.mediaType.startsWith('image/')) {
    return part;
  }

  const mediaId = extractMediaIdFromDownloadUrl(part.url);
  const media = mediaId ? attachmentsByMediaId.get(mediaId) : undefined;

  if (!media) {
    return null;
  }

  return media.mimeType === 'application/pdf'
    ? inlinePdfFilePart(part, media)
    : toExtractedTextPart(part, media);
}

async function resolveModelFacingUserMessage(
  message: UIMessage,
  attachmentsByMediaId: Map<string, Media>,
): Promise<UIMessage> {
  if (!message.parts.some((part) => part.type === 'file')) {
    return message;
  }

  const resolvedParts = await Promise.all(
    message.parts.map((part) => resolveModelFacingFilePart(part, attachmentsByMediaId)),
  );

  return {
    ...message,
    parts: resolvedParts.filter((part): part is UIMessagePartLike => part !== null),
  };
}

// Resolves every user message's file parts against the chat's current
// attachments. Never mutates `messages`; the caller persists that original
// array as-is.
async function resolveModelFacingMessages(
  messages: UIMessage[],
  attachmentsByMediaId: Map<string, Media>,
): Promise<UIMessage[]> {
  if (attachmentsByMediaId.size === 0) {
    return messages;
  }

  return Promise.all(
    messages.map((message) =>
      message.role === 'user'
        ? resolveModelFacingUserMessage(message, attachmentsByMediaId)
        : message,
    ),
  );
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

// Auto-continue (sendAutomaticallyWhen in ChatConversation.vue) resends the
// already-persisted last message instead of a new one; skip re-appending it.
function isEchoOfLastPersistedMessage(message: unknown, lastPersisted: { id: string } | undefined) {
  return (
    lastPersisted !== undefined &&
    typeof message === 'object' &&
    message !== null &&
    'id' in message &&
    message.id === lastPersisted.id
  );
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
    // credits, or if the chat's model has no chargeable pricing.
    // Throws
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
      messages: isEchoOfLastPersistedMessage(message, userChat.messages.at(-1))
        ? userChat.messages
        : [...userChat.messages, message],
    });

    if (!validated.success) {
      logger.warn(`Invalid messages for chat ${chatId}`, validated.error);
      throw new BadRequestException('Invalid messages format');
    }

    const validUiMessages = validated.data;

    const { error: attachmentsError, data: chatAttachments } = await tryCatch(() =>
      getChatAttachmentsByChatId({ chatId: userChat.id }),
    );

    if (attachmentsError !== null || !chatAttachments) {
      logger.error(`Failed to load attachments for chat ${userChat.id}`, attachmentsError);
      throw new InternalServerErrorException('Failed to load chat attachments');
    }

    const attachmentsByMediaId = new Map(
      chatAttachments.map((attachment): [string, Media] => [attachment.mediaId, attachment.media]),
    );

    const modelFacingMessages = await resolveModelFacingMessages(
      mergeConsecutiveUserMessages(validUiMessages),
      attachmentsByMediaId,
    );
    const validModelMessages = await convertToModelMessages(modelFacingMessages);
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
    // from the conversation.
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
      generateId: createPrimaryId,
      onError(error) {
        logger.error(`Error in chat stream for chat ${chatId}`, error);
        // An i18n key, not display text: the frontend translates it
        // (ChatConversation.vue renders `error.message` through `$t`).
        return 'chat.conversation.errors.generic';
      },
      execute: ({ writer: dataStream }) => {
        // Handle title generation in parallel
        if (titlePromise) {
          titlePromise.then((title) => {
            updateChatTitleById({ chatId: userChat.id, userId, title });
            dataStream.write({
              type: 'data-chatTitle',
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
          instructions: withCachedInstructions(instructions),
          messages: withCachedLastMessage(validModelMessages),
          model: getLanguageModel({
            provider: agent.aiModel.provider,
            model: agent.aiModel.model,
          }),
          providerOptions: withDefaultProviderOptions(),
          temperature: modelSettings.temperature,
          maxOutputTokens: modelSettings.maxOutputTokens,
          reasoning: modelSettings.reasoning,
          tools,
          // Matches the workflow/team-node agent step caps.
          stopWhen: stepCountIs(15),
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
            // never checked would get charged.
            // A provider-side error mid-generation still
            // consumes input tokens, but V1 charges nothing for it, same as
            // the persistence onEnd below skips isAborted/'error' turns.
            if (!creditSpendState || res.finishReason === 'error') {
              return;
            }

            // Settlement must never break a finished turn: the response is
            // already streamed by then. A dropped charge is a bug to fix in
            // reconciliation, not a reason to fail a completed chat turn.
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
                // Deliberately no noCacheInputTokens: it's a display-only
                // breakdown of inputTokens (usage.ts), excluded from
                // NormalizedUsageFields by design, and derivable as
                // inputTokens - cacheReadTokens.
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
      async onEnd({ responseMessage, isAborted, finishReason, outcome }) {
        if (isAborted || finishReason === 'error' || outcome.status === 'failed') {
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
    // messages.
    for await (const uiMessageChunk of uiMessageStream) {
      onChunk(uiMessageChunk);
    }
  } finally {
    inFlightRunsByChatId.delete(chatId);
  }
}
