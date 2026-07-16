import {
  buildAgentInstructions,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  getLanguageModel,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
  tools,
  toUIMessageStream,
} from '@repo/ai';
import {
  createChat,
  deleteChatById,
  getAllChatsByUserId,
  getChatByIdForUser,
  getChatCountByUserId,
  getOrCreateDefaultAgentForUser,
  updateChatTitleById,
  upsertChatMessages,
} from '@repo/database';
import { logger } from '@repo/logger';
import { createPrimaryId, tryCatch } from '@repo/utils';
import { Hono } from 'hono';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '../exceptions';
import { authMiddleware } from '../middlewares/authMiddleware';
import {
  validChatIdParam,
  validCreateChatBody,
  validWorkspaceScopedListQuery,
} from '../middlewares/validationMiddlewares';
import { generateChatTitle } from '../services/chat.service';

export const chatController = new Hono()
  .basePath('/chat')
  .use(authMiddleware)
  /**
   * [GET] /chat
   * Get all chats for the authenticated user
   */
  .get('/', validWorkspaceScopedListQuery, async (c) => {
    const user = c.get('user');
    const query = c.req.valid('query');

    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 10;
    const sort = query.sort || 'desc';
    const unassigned = query.unassigned === 'true';

    // Calculate offset for pagination ((page number - 1) * page size)
    const offset = page && limit ? (page - 1) * limit : undefined;

    // Get all chat count and fail gracefully
    const { data: chatsCount } = await tryCatch(() =>
      getChatCountByUserId({ userId: user.id, workspaceId: query.workspaceId, unassigned }),
    );

    // Get chat history for user
    const { error, data: userChats } = await tryCatch(() =>
      getAllChatsByUserId({
        userId: user.id,
        workspaceId: query.workspaceId,
        unassigned,
        limit,
        offset,
        sort,
      }),
    );

    if (error !== null) {
      logger.error(`Error fetching chat history for user ${user.id}`, error);
      throw new InternalServerErrorException('Failed to fetch chat history');
    }

    if (!userChats) {
      throw new NotFoundException('Chat not found');
    }

    const userChatsHistoryDto = userChats.map((chat) => {
      return {
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        agent: {
          id: chat.agent.id,
          name: chat.agent.name,
          aiModel: {
            id: chat.agent.aiModel.id,
            provider: chat.agent.aiModel.provider,
            displayName: chat.agent.aiModel.displayName,
          },
        },
      };
    });

    const meta = {
      totalCount: chatsCount || 0,
    };

    return c.json({ chats: userChatsHistoryDto, meta });
  })
  /**
   * [POST] /chat
   * Create a new chat for the authenticated user
   */
  .post('/', validCreateChatBody, async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    let agentId: string;

    if (!body.agentId) {
      const { error, data: agent } = await tryCatch(() =>
        getOrCreateDefaultAgentForUser({ userId: user.id, workspaceId: body.workspaceId }),
      );

      if (error !== null || !agent) {
        logger.error(`Error fetching default agent for user ${user.id}`, error);
        throw new InternalServerErrorException('Failed to fetch default agent');
      }

      agentId = agent.id;
    } else {
      agentId = body.agentId;
    }

    const { error, data: chat } = await tryCatch(() =>
      createChat({
        userId: user.id,
        agentId,
        title: 'New Chat',
        workspaceId: body.workspaceId,
      }),
    );

    if (error !== null || !chat) {
      logger.error(`Error creating chat for user ${user.id}`, error);
      throw new InternalServerErrorException('Failed to create chat');
    }

    return c.json({ chat });
  })
  /**
   * [GET] /chat/:chatId
   * Get a specific chat by ID for the authenticated user
   */
  .get('/:chatId', validChatIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const { error, data: userChat } = await tryCatch(() =>
      getChatByIdForUser({
        chatId: param.chatId,
        userId: user.id,
      }),
    );

    if (error !== null) {
      logger.error(`Error fetching chat ${param.chatId} for user ${user.id}`, error);
      throw new InternalServerErrorException('Failed to fetch chat');
    }

    if (!userChat) {
      throw new NotFoundException('Chat not found');
    }

    // Return stored messages strictly UIMessage-shaped ({ id, role, parts, metadata? })
    // so the client can feed them into useChat as-is.
    const messagesDto = userChat.messages.map((message) => ({
      id: message.id,
      role: message.role,
      parts: message.parts,
      metadata: message.metadata ?? undefined,
    }));

    const chatDto = {
      id: userChat.id,
      agentId: userChat.agentId,
      title: userChat.title,
      createdAt: userChat.createdAt,
      updatedAt: userChat.updatedAt,
      messages: messagesDto.length ? messagesDto : null,
    };

    return c.json({ chat: chatDto });
  })
  /**
   * [DELETE] /chat/:chatId
   * Delete a specific chat (and its messages via cascade) for the authenticated user
   */
  .delete('/:chatId', validChatIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const { error } = await tryCatch(() =>
      deleteChatById({ chatId: param.chatId, userId: user.id }),
    );

    if (error !== null) {
      logger.error(`Error deleting chat ${param.chatId} for user ${user.id}`, error);
      throw new InternalServerErrorException('Failed to delete chat');
    }

    return c.json({ message: 'Chat deleted successfully' });
  })
  /**
   * [POST] /chat/:chatId
   * Handle incoming chat messages and stream responses back to the client
   */
  .post('/:chatId', validChatIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');
    const body = await c.req.json();

    // Get chat for user
    const { error: userChatError, data: userChat } = await tryCatch(() =>
      getChatByIdForUser({ chatId: param.chatId, userId: user.id }),
    );

    if (userChatError !== null) {
      throw new InternalServerErrorException('Failed to fetch chat');
    }

    if (!userChat) {
      throw new NotFoundException('Chat not found');
    }

    const validated = await safeValidateUIMessages({ messages: body.messages });

    if (!validated.success) {
      logger.warn(`Invalid messages for chat ${param.chatId}`, validated.error);
      throw new BadRequestException('Invalid messages format');
    }

    let titlePromise: Promise<string> | null = null;

    const { agent } = userChat;

    const validUiMessages = validated.data;
    const modelMessages = await convertToModelMessages(validUiMessages);
    const instructions = await buildAgentInstructions({
      agentId: agent.id,
      tools: agent.tools,
      systemPrompt: agent.systemPrompt,
      context: agent.context,
    });

    const lastUiMessage = validUiMessages.at(-1);

    if (userChat.messages.length === 0 && lastUiMessage?.role === 'user') {
      titlePromise = generateChatTitle({
        uiMessage: lastUiMessage,
      });
    }

    logger.debug(`Processing messages for chat ${param.chatId}`, { messages: validUiMessages });

    const stream = createUIMessageStream({
      originalMessages: validUiMessages,
      execute: ({ writer: dataStream }) => {
        // Handle title generation in parallel
        if (titlePromise) {
          titlePromise.then((title) => {
            updateChatTitleById({ chatId: userChat.id, title });
            dataStream.write({
              type: 'data-chat-title',
              data: { title },
              transient: true, // no history
            });
          });
        }

        // Stream the response from the language model
        const result = streamText({
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
          tools: tools(dataStream, {
            userId: user.id,
            agentId: agent.id,
            workspaceId: userChat.workspaceId,
          }),
          activeTools: agent.tools,
          stopWhen: stepCountIs(5),
          temperature: agent.settings?.temperature ?? undefined,
          maxOutputTokens: agent.settings?.maxOutputTokens ?? undefined,
          onStart({ callId, modelId, runtimeContext }) {
            logger.debug('Request started', {
              callId,
              modelId,
              runtimeContext,
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

    return createUIMessageStreamResponse({ stream });
  });
