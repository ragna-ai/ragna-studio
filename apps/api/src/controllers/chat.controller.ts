import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  getLanguageModel,
  streamText,
  toUIMessageStream,
} from '@repo/ai';
import {
  createChat,
  getAllChatsByUserId,
  getChatByIdForUser,
  getChatCountByUserId,
  getOrCreateDefaultAgentForUser,
} from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import { Hono } from 'hono';
import { InternalServerErrorException, NotFoundException } from '../exceptions';
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

    const chatDto = {
      id: userChat.id,
      agentId: userChat.agentId,
      title: userChat.title,
      createdAt: userChat.createdAt,
      updatedAt: userChat.updatedAt,
      messages: userChat.messages.length ? userChat.messages : null,
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

    if (!body.messages || !Array.isArray(body.messages)) {
      throw new InternalServerErrorException('Invalid messages format');
    }

    logger.debug(`Processing messages for chat ${param.chatId}`, { messages: body.messages });

    const { agent } = userChat;

    const result = streamText({
      model: getLanguageModel({
        provider: agent.aiModel.provider,
        model: agent.aiModel.model,
      }),
      instructions: agent.systemPrompt,
      messages: await convertToModelMessages(body.messages),
      temperature: 0.8,
      maxOutputTokens: 2000,
      // experimental_transform: smoothStream({
      //   delayInMs: 20,
      //   chunking: 'word',
      // }),
      onStart({ callId, modelId, runtimeContext }) {
        logger.debug('Request started', {
          callId,
          modelId,
          runtimeContext,
        });
      },
      onEnd({ callId, usage, finishReason }) {
        logger.debug('Request finished', {
          callId,
          finishReason,
          usage,
        });
      },
      onError(error) {
        logger.error('Error in chat stream', error);
      },
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream }),
    });
  });
