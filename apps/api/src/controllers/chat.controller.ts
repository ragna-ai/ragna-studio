import { Hono } from 'hono';
import { StatusCodes } from 'http-status-codes';
import { authMiddleware } from '../middlewares/authMiddleware';
import { workspaceGuard } from '../middlewares/workspaceGuard';
import {
  branchChatForWorkspace,
  createChatForWorkspace,
  deleteChatForWorkspace,
  getChatForWorkspace,
  listChatsForWorkspace,
  renameChatForWorkspace,
  searchChatsForWorkspace,
} from '../services/chat.service';
import { removeChatAttachment, uploadChatAttachments } from '../services/media.service';
import {
  validBranchChatBody,
  validChatAttachmentParams,
  validChatIdParam,
  validChatSearchQuery,
  validCreateChatBody,
  validPaginationQuery,
  validUpdateChatTitleBody,
} from '../validation';

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
      page: query.page,
      limit: query.limit,
      sort: query.sort,
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

    return c.json({ chat }, StatusCodes.CREATED);
  })
  /**
   * [GET] /workspace/:workspaceId/chat/search
   * Registered before `/:chatId`: Hono matches routes in registration
   * order, so `/:chatId` would otherwise greedily capture "search" as a
   * chatId param.
   */
  .get('/search', validChatSearchQuery, async (c) => {
    const workspace = c.get('workspace');
    const query = c.req.valid('query');

    const result = await searchChatsForWorkspace({
      workspaceId: workspace.id,
      q: query.q,
      page: query.page,
      limit: query.limit,
      snippetsPerChat: query.snippetsPerChat,
      caseSensitive: query.caseSensitive,
    });

    return c.json(result);
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
   * [POST] /workspace/:workspaceId/chat/:chatId/branch
   * Copies the chat's messages up to and including messageId into a new,
   * independent chat (docs/chat/branching.md). The source chat is untouched.
   */
  .post('/:chatId/branch', validChatIdParam, validBranchChatBody, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const chat = await branchChatForWorkspace({
      workspaceId: workspace.id,
      chatId: param.chatId,
      messageId: body.messageId,
    });

    return c.json({ chat }, StatusCodes.CREATED);
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
  })
  /**
   * [POST] /workspace/:workspaceId/chat/:chatId/attachments
   * Upload one or more files in a single multipart request (`files` field)
   * and attach them to the chat.
   */
  .post('/:chatId/attachments', validChatIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const body = await c.req.parseBody({ all: true });
    const filesField = body.files;
    const files = Array.isArray(filesField) ? filesField : filesField ? [filesField] : [];
    const uploadedFiles = files.filter((file): file is File => file instanceof File);

    const result = await uploadChatAttachments({
      workspaceId: workspace.id,
      chatId: param.chatId,
      files: uploadedFiles,
    });

    return c.json(result, StatusCodes.CREATED);
  })
  /**
   * [DELETE] /workspace/:workspaceId/chat/:chatId/attachments/:attachmentId
   * Detaches a file from the chat and deletes its media once unreferenced.
   */
  .delete('/:chatId/attachments/:attachmentId', validChatAttachmentParams, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    await removeChatAttachment({
      workspaceId: workspace.id,
      chatId: param.chatId,
      attachmentId: param.attachmentId,
    });

    return c.json({ message: 'Attachment deleted successfully' });
  });
// Chat message streaming (previously [POST] /chat/:chatId) lives on the WS
// `chat:<chatId>` channel (see ws.controller.ts + services/chat.service.ts's
// runChatStream), unchanged by this migration. HTTP request teardown still
// doesn't cancel a run for free; see chat.service.ts's in-flight run
// registry and abortChatRun.
