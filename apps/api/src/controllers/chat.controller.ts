import {
  createChat,
  deleteChatById,
  getAllChatsByUserId,
  getChatByIdForUser,
  getChatCountByUserId,
  getOrCreateDefaultAgentForUser,
  updateChatTitleById,
} from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import { Hono } from 'hono';
import { InternalServerErrorException, NotFoundException } from '../exceptions';
import { authMiddleware } from '../middlewares/authMiddleware';
import {
  validChatIdParam,
  validCreateChatBody,
  validUpdateChatTitleBody,
  validWorkspaceScopedListQuery,
} from '../middlewares/validationMiddlewares';

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
   * [PATCH] /chat/:chatId
   * Rename a specific chat owned by the authenticated user
   */
  .patch('/:chatId', validChatIdParam, validUpdateChatTitleBody, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const { error, data: chat } = await tryCatch(() =>
      updateChatTitleById({ chatId: param.chatId, userId: user.id, title: body.title }),
    );

    if (error !== null) {
      logger.error(`Error renaming chat ${param.chatId} for user ${user.id}`, error);
      throw new InternalServerErrorException('Failed to rename chat');
    }

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    return c.json({ chat });
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
  });
// Chat message streaming ([POST] /chat/:chatId) moved to the WS `chat:<chatId>`
// channel (see ws.controller.ts + services/chat.service.ts#runChatStream).
// HTTP request teardown no longer cancels a run for free; see
// chat.service.ts's in-flight run registry and abortChatRun.
