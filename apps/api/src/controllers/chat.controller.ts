import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/authMiddleware';
import { workspaceGuard } from '../middlewares/workspaceGuard';
import {
  validChatIdParam,
  validCreateChatBody,
  validPaginationQuery,
  validUpdateChatTitleBody,
} from '../validation';
import {
  createChatForWorkspace,
  deleteChatForWorkspace,
  getChatForWorkspace,
  listChatsForWorkspace,
  renameChatForWorkspace,
} from '../services/chat.service';

export const chatController = new Hono()
  .basePath('/workspace/:workspaceId/chat')
  .use(authMiddleware)
  .use(workspaceGuard)
  /**
   * [GET] /workspace/:workspaceId/chat
   * List a workspace's chats, paginated and sorted by createdAt.
   */
  .get('/', validPaginationQuery, async (c) => {
    const workspace = c.get('workspace');
    const query = c.req.valid('query');

    const { chats, totalCount } = await listChatsForWorkspace({
      workspaceId: workspace.id,
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      sort: query.sort ?? 'desc',
    });

    return c.json({ chats, meta: { totalCount } });
  })
  /**
   * [POST] /workspace/:workspaceId/chat
   * Create a new chat. Defaults to the workspace's default agent.
   */
  .post('/', validCreateChatBody, async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const body = c.req.valid('json');

    const chat = await createChatForWorkspace({
      workspaceId: workspace.id,
      userId: user.id,
      agentId: body.agentId,
    });

    return c.json({ chat }, 201);
  })
  /**
   * [GET] /workspace/:workspaceId/chat/:chatId
   */
  .get('/:chatId', validChatIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const chat = await getChatForWorkspace({ workspaceId: workspace.id, chatId: param.chatId });

    return c.json({ chat });
  })
  /**
   * [PATCH] /workspace/:workspaceId/chat/:chatId
   * Renames a chat.
   */
  .patch('/:chatId', validChatIdParam, validUpdateChatTitleBody, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const chat = await renameChatForWorkspace({
      workspaceId: workspace.id,
      chatId: param.chatId,
      title: body.title,
    });

    return c.json({ chat });
  })
  /**
   * [DELETE] /workspace/:workspaceId/chat/:chatId
   * Deletes a chat (and its messages via cascade).
   */
  .delete('/:chatId', validChatIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    await deleteChatForWorkspace({ workspaceId: workspace.id, chatId: param.chatId });

    return c.json({ message: 'Chat deleted successfully' });
  });
// Chat message streaming (previously [POST] /chat/:chatId) lives on the WS
// `chat:<chatId>` channel (see ws.controller.ts + services/chat.service.ts's
// runChatStream), unchanged by this migration. HTTP request teardown still
// doesn't cancel a run for free; see chat.service.ts's in-flight run
// registry and abortChatRun.
