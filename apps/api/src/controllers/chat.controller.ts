import {
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
  getAllChatsByUserId,
  getChatByIdForUser,
  getChatCountByUserId,
  getOrCreateDefaultAgentForUser,
  upsertChatMessages,
} from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
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
  validPaginationQuery,
} from '../middlewares/validationMiddlewares';

export const chatController = new Hono()
  .basePath('/chat')
  .use(authMiddleware)
  /**
   * [GET] /chat
   * Get all chats for the authenticated user
   */
  .get('/', validPaginationQuery, async (c) => {
    const user = c.get('user');
    const query = c.req.valid('query');

    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 10;
    const sort = query.sort || 'desc';

    // Calculate offset for pagination ((page number - 1) * page size)
    const offset = page && limit ? (page - 1) * limit : undefined;

    // Get all chat count and fail gracefully
    const { data: chatsCount } = await tryCatch(() => getChatCountByUserId({ userId: user.id }));

    // Get chat history for user
    const { error, data: userChats } = await tryCatch(() =>
      getAllChatsByUserId({
        userId: user.id,
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
        getOrCreateDefaultAgentForUser({ userId: user.id }),
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
      createChat({ userId: user.id, agentId, title: 'New Chat' }),
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

    const uiMessages = validated.data;

    logger.debug(`Processing messages for chat ${param.chatId}`, { messages: uiMessages });

    const { agent } = userChat;

    const modelMessages = await convertToModelMessages(uiMessages);

    const stream = createUIMessageStream({
      originalMessages: uiMessages,
      execute: ({ writer: dataStream }) => {
        // Stream the response from the language model
        const result = streamText({
          timeout: 120_000, // 2 minutes timeout
          model: getLanguageModel({
            provider: agent.aiModel.provider,
            model: agent.aiModel.model,
          }),
          instructions: agent.systemPrompt,
          messages: modelMessages,
          tools: tools(dataStream),
          activeTools: agent.tools,
          stopWhen: stepCountIs(5),
          temperature: 0.8,
          maxOutputTokens: 2000,
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
        const lastMessage = uiMessages.at(-1);
        const messagesToSave = lastMessage?.role === 'user'
          ? [lastMessage, responseMessage]
          : [responseMessage];

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
