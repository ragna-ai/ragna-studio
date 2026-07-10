import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  getLanguageModel,
  smoothStream,
  streamText,
  toUIMessageStream,
} from '@repo/ai';
import {
  createChat,
  getAllChatsByUserId,
  getChatByIdForUser,
  getChatCountByUserId,
  getOrCreateDefaultAssistantForUser,
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
    const validated = c.req.valid('query');

    const page = validated.page ? Number(validated.page) : 1;
    const limit = validated.limit ? Number(validated.limit) : 10;
    const sort = validated.sort || 'desc';

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
        assistant: {
          id: chat.assistant.id,
          name: chat.assistant.name,
          aiModel: {
            id: chat.assistant.aiModel.id,
            provider: chat.assistant.aiModel.provider,
            displayName: chat.assistant.aiModel.displayName,
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

    let assistantId: string;

    if (!body.assistantId) {
      const { error, data: assistant } = await tryCatch(() =>
        getOrCreateDefaultAssistantForUser({ userId: user.id }),
      );

      if (error !== null || !assistant) {
        logger.error(`Error fetching default assistant for user ${user.id}`, error);
        throw new InternalServerErrorException('Failed to fetch default assistant');
      }

      assistantId = assistant.id;
    } else {
      assistantId = body.assistantId;
    }

    const { error, data: chat } = await tryCatch(() =>
      createChat({ userId: user.id, assistantId, title: 'New Chat' }),
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
    const { chatId } = c.req.valid('param');

    const { error, data: userChat } = await tryCatch(() =>
      getChatByIdForUser({
        chatId,
        userId: user.id,
      }),
    );

    if (error !== null) {
      logger.error(`Error fetching chat ${chatId} for user ${user.id}`, error);
      throw new InternalServerErrorException('Failed to fetch chat');
    }

    if (!userChat) {
      throw new NotFoundException('Chat not found');
    }

    const chatDto = {
      id: userChat.id,
      assistantId: userChat.assistantId,
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
    const { chatId } = c.req.valid('param');
    const body = await c.req.json();

    // Get chat for user
    const { error: chatError, data: chat } = await tryCatch(() =>
      getChatByIdForUser({ chatId, userId: user.id }),
    );

    if (chatError !== null) {
      throw new InternalServerErrorException('Failed to fetch chat');
    }

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    if (!body.messages || !Array.isArray(body.messages)) {
      throw new InternalServerErrorException('Invalid messages format');
    }

    logger.debug(`Processing messages for chat ${chatId}`, { messages: body.messages });

    const result = streamText({
      model: getLanguageModel({
        provider: chat.assistant.aiModel.provider,
        model: chat.assistant.aiModel.model,
      }),
      instructions: chat.assistant.systemPrompt,
      messages: await convertToModelMessages(body.messages),
      temperature: 0.8,
      maxOutputTokens: 2000,
      experimental_transform: smoothStream({
        delayInMs: 20,
        chunking: 'word',
      }),
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
  })
  /**
   * [POST] /chat/test
   * Test endpoint for chat functionality
   */
  .post('/test', async (c) => {
    const user = c.get('user');
    const { messages } = await c.req.json();

    const languageModel = getLanguageModel({
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
    });

    const result = streamText({
      model: languageModel,
      instructions: 'You are a helpful assistant.',
      messages: await convertToModelMessages(messages),
      temperature: 0.8,
      maxOutputTokens: 2000,
      experimental_transform: smoothStream({
        delayInMs: 20,
        chunking: 'word',
      }),
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
