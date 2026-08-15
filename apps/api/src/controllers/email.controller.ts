import { Hono } from 'hono';
import { StatusCodes } from 'http-status-codes';
import { authMiddleware } from '../middlewares/authMiddleware';
import {
  ActiveDraftConflictError,
  addAutoDraftSenderForUser,
  connectEmailAccount,
  createEmailCategoryForUser,
  createEmailDraftForUser,
  deleteEmailCategoryForUser,
  discardEmailDraftForUser,
  disconnectEmailAccount,
  downloadEmailAttachmentForUser,
  getEmailAccountStatus,
  getEmailDraftForUser,
  getEmailThreadDetailForUser,
  listAutoDraftSendersForUser,
  listEmailCategoriesForUser,
  listEmailDraftsForUser,
  listEmailMessageAttachmentsForUser,
  listEmailThreadsForUser,
  listPendingEmailDraftsForUser,
  removeAutoDraftSenderForUser,
  searchEmailForUser,
  sendEmailDraftForUser,
  sendEmailForUser,
  setMessageArchivedForUser,
  setMessageReadForUser,
  setMessageStarredForUser,
  setThreadArchivedForUser,
  setThreadReadForUser,
  setThreadStarredForUser,
  setThreadTrashedForUser,
  syncEmailAccountNowForUser,
  trashMessageForUser,
  triggerEmailDraftForUser,
  updateEmailAccountSettingsForUser,
  updateEmailCategoryForUser,
  updateEmailDraftForUser,
} from '../services/email.service';
import {
  validArchiveActionBody,
  validAutoDraftSenderIdParam,
  validCreateAutoDraftSenderBody,
  validCreateEmailCategoryBody,
  validCreateEmailDraftBody,
  validEmailAttachmentParams,
  validEmailCategoryIdParam,
  validEmailDraftIdParam,
  validEmailDraftListQuery,
  validEmailMessageIdParam,
  validEmailSearchQuery,
  validEmailThreadIdParam,
  validEmailThreadListQuery,
  validReadActionBody,
  validSendEmailBody,
  validSendEmailDraftBody,
  validStarActionBody,
  validTriggerEmailDraftBody,
  validUpdateEmailAccountSettingsBody,
  validUpdateEmailCategoryBody,
  validUpdateEmailDraftBody,
} from '../validation';

export const emailController = new Hono()
  .basePath('/email')
  .use(authMiddleware)
  // --- Account ------------------------------------------------------
  /**
   * [GET] /email/account
   */
  .get('/account', async (c) => {
    const user = c.get('user');
    const status = await getEmailAccountStatus({ userId: user.id });
    return c.json(status);
  })
  /**
   * [POST] /email/account/connect
   */
  .post('/account/connect', async (c) => {
    const user = c.get('user');
    const account = await connectEmailAccount({ userId: user.id });
    return c.json({ account }, StatusCodes.CREATED);
  })
  /**
   * [POST] /email/account/disconnect
   */
  .post('/account/disconnect', async (c) => {
    const user = c.get('user');
    await disconnectEmailAccount({ userId: user.id });
    return c.json({ message: 'Gmail disconnected successfully' });
  })
  /**
   * [POST] /email/account/sync
   * Manual "Sync now". Enqueues, dedupes against an in-flight cron sync,
   * and returns the account's current syncState so the client can show
   * "already syncing" right away.
   */
  .post('/account/sync', async (c) => {
    const user = c.get('user');
    const account = await syncEmailAccountNowForUser({ userId: user.id });
    return c.json({ account }, StatusCodes.ACCEPTED);
  })
  /**
   * [PATCH] /email/account/settings
   */
  .patch('/account/settings', validUpdateEmailAccountSettingsBody, async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const account = await updateEmailAccountSettingsForUser({
      userId: user.id,
      defaultAgentId: body.defaultAgentId,
    });

    return c.json({ account });
  })
  // --- Categories -----------------------------------------------------
  /**
   * [GET] /email/category
   */
  .get('/category', async (c) => {
    const user = c.get('user');
    const categories = await listEmailCategoriesForUser({ userId: user.id });
    return c.json({ categories });
  })
  /**
   * [POST] /email/category
   */
  .post('/category', validCreateEmailCategoryBody, async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const category = await createEmailCategoryForUser({ userId: user.id, ...body });
    return c.json({ category }, StatusCodes.CREATED);
  })
  /**
   * [PATCH] /email/category/:categoryId
   */
  .patch(
    '/category/:categoryId',
    validEmailCategoryIdParam,
    validUpdateEmailCategoryBody,
    async (c) => {
      const user = c.get('user');
      const { categoryId } = c.req.valid('param');
      const body = c.req.valid('json');

      const category = await updateEmailCategoryForUser({ userId: user.id, categoryId, ...body });
      return c.json({ category });
    },
  )
  /**
   * [DELETE] /email/category/:categoryId
   */
  .delete('/category/:categoryId', validEmailCategoryIdParam, async (c) => {
    const user = c.get('user');
    const { categoryId } = c.req.valid('param');

    await deleteEmailCategoryForUser({ userId: user.id, categoryId });
    return c.json({ message: 'Category deleted successfully' });
  })
  // --- Auto-draft senders -----------------------------------------------
  /**
   * [GET] /email/auto-draft-sender
   */
  .get('/auto-draft-sender', async (c) => {
    const user = c.get('user');
    const senders = await listAutoDraftSendersForUser({ userId: user.id });
    return c.json({ senders });
  })
  /**
   * [POST] /email/auto-draft-sender
   */
  .post('/auto-draft-sender', validCreateAutoDraftSenderBody, async (c) => {
    const user = c.get('user');
    const { senderEmail } = c.req.valid('json');

    const sender = await addAutoDraftSenderForUser({ userId: user.id, senderEmail });
    return c.json({ sender }, StatusCodes.CREATED);
  })
  /**
   * [DELETE] /email/auto-draft-sender/:senderId
   */
  .delete('/auto-draft-sender/:senderId', validAutoDraftSenderIdParam, async (c) => {
    const user = c.get('user');
    const { senderId } = c.req.valid('param');

    await removeAutoDraftSenderForUser({ userId: user.id, senderId });
    return c.json({ message: 'Sender removed successfully' });
  })
  // --- Search (before /thread/:threadId so "search" never matches as an id) --
  /**
   * [GET] /email/search
   */
  .get('/search', validEmailSearchQuery, async (c) => {
    const user = c.get('user');
    const { q, pageToken } = c.req.valid('query');

    const result = await searchEmailForUser({ userId: user.id, query: q, pageToken });
    return c.json(result);
  })
  // --- Drafts (static prefixes before /thread/:threadId's dynamic sibling) --
  /**
   * [GET] /email/draft?threadId=...
   * `threadId` absent -> every non-terminal draft on the account (the
   * Drafts folder).
   */
  .get('/draft', validEmailDraftListQuery, async (c) => {
    const user = c.get('user');
    const { threadId } = c.req.valid('query');

    const drafts = await listEmailDraftsForUser({ userId: user.id, threadId });
    return c.json({ drafts });
  })
  /**
   * [GET] /email/draft/pending
   */
  .get('/draft/pending', async (c) => {
    const user = c.get('user');
    const drafts = await listPendingEmailDraftsForUser({ userId: user.id });
    return c.json({ drafts });
  })
  /**
   * [POST] /email/draft
   * Creates the local row for one of the four compose entry points:
   * `{ kind, threadId?, replyToMessageId? }`. 409s with the same `{ draft }`
   * envelope a successful create returns - the existing non-terminal draft
   * on the thread - instead of opening a second one
   * (one-active-draft-per-thread), so the client can focus it and read its
   * `kind` to decide whether to offer a replace.
   */
  .post('/draft', validCreateEmailDraftBody, async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    try {
      const draft = await createEmailDraftForUser({ userId: user.id, ...body });
      return c.json({ draft }, StatusCodes.CREATED);
    } catch (error) {
      if (error instanceof ActiveDraftConflictError) {
        return c.json({ draft: error.draft }, StatusCodes.CONFLICT);
      }
      throw error;
    }
  })
  /**
   * [GET] /email/draft/:draftId
   */
  .get('/draft/:draftId', validEmailDraftIdParam, async (c) => {
    const user = c.get('user');
    const { draftId } = c.req.valid('param');

    const draft = await getEmailDraftForUser({ userId: user.id, draftId });
    return c.json({ draft });
  })
  /**
   * [POST] /email/draft/trigger
   * Manual "Draft with AI". Enqueues and acknowledges; the worker writes
   * the draft row.
   */
  .post('/draft/trigger', validTriggerEmailDraftBody, async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    await triggerEmailDraftForUser({ userId: user.id, ...body });
    return c.body(null, StatusCodes.ACCEPTED);
  })
  /**
   * [PATCH] /email/draft/:draftId
   * Autosave endpoint, widened to the full editable set: any of
   * `{ to, cc, bcc, subject, content, text, attachments }`, plus a
   * control-only `flush?: boolean` that forces this call to push to Gmail
   * regardless of the attachment write-back debounce rule (set on panel
   * close and before send). Creation-only fields (`origin`, `kind`,
   * `threadId`, `replyToMessageId`, `agentId`) are rejected at the
   * validation layer.
   */
  .patch('/draft/:draftId', validEmailDraftIdParam, validUpdateEmailDraftBody, async (c) => {
    const user = c.get('user');
    const { draftId } = c.req.valid('param');
    const body = c.req.valid('json');

    const draft = await updateEmailDraftForUser({ userId: user.id, draftId, ...body });
    return c.json({ draft });
  })
  /**
   * [POST] /email/draft/:draftId/discard
   */
  .post('/draft/:draftId/discard', validEmailDraftIdParam, async (c) => {
    const user = c.get('user');
    const { draftId } = c.req.valid('param');

    const draft = await discardEmailDraftForUser({ userId: user.id, draftId });
    return c.json({ draft });
  })
  /**
   * [POST] /email/draft/:draftId/send
   * Same multipart shape as /email/send (minus threading, which comes from
   * the draft itself): to/cc/bcc, subject, html/text, mediaId[], files[],
   * plus an optional `content` (the final edited markdown, if the user
   * changed the draft in the editor before sending) persisted onto the
   * draft row alongside the `sent` status update.
   */
  .post('/draft/:draftId/send', validEmailDraftIdParam, validSendEmailDraftBody, async (c) => {
    const user = c.get('user');
    const { draftId } = c.req.valid('param');
    const body = c.req.valid('form');

    const result = await sendEmailDraftForUser({
      userId: user.id,
      draftId,
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      html: body.html,
      text: body.text,
      content: body.content,
      mediaIds: body.mediaId,
      files: body.files,
    });

    return c.json(result, StatusCodes.CREATED);
  })
  // --- Compose / send -----------------------------------------------------
  /**
   * [POST] /email/send
   * Multipart request: `to`/`cc`/`bcc` (repeated address fields), `subject`,
   * `html`/`text`, `threadId`+`replyToMessageId` for a reply, `mediaId`
   * (repeated, existing media-library picks), `files` (repeated, fresh
   * uploads attached directly without ever touching R2).
   */
  .post('/send', validSendEmailBody, async (c) => {
    const user = c.get('user');
    const body = c.req.valid('form');

    const result = await sendEmailForUser({
      userId: user.id,
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      html: body.html,
      text: body.text,
      threadId: body.threadId,
      replyToMessageId: body.replyToMessageId,
      mediaIds: body.mediaId,
      files: body.files,
      draftId: body.draftId,
    });

    return c.json(result, StatusCodes.CREATED);
  })
  // --- Message actions ------------------------------------------------
  /**
   * [POST] /email/message/:messageId/archive
   */
  .post(
    '/message/:messageId/archive',
    validEmailMessageIdParam,
    validArchiveActionBody,
    async (c) => {
      const user = c.get('user');
      const { messageId } = c.req.valid('param');
      const { archived } = c.req.valid('json');

      const message = await setMessageArchivedForUser({ userId: user.id, messageId, archived });
      return c.json({ message });
    },
  )
  /**
   * [POST] /email/message/:messageId/trash
   */
  .post('/message/:messageId/trash', validEmailMessageIdParam, async (c) => {
    const user = c.get('user');
    const { messageId } = c.req.valid('param');

    const message = await trashMessageForUser({ userId: user.id, messageId });
    return c.json({ message });
  })
  /**
   * [POST] /email/message/:messageId/star
   */
  .post('/message/:messageId/star', validEmailMessageIdParam, validStarActionBody, async (c) => {
    const user = c.get('user');
    const { messageId } = c.req.valid('param');
    const { starred } = c.req.valid('json');

    const message = await setMessageStarredForUser({ userId: user.id, messageId, starred });
    return c.json({ message });
  })
  /**
   * [POST] /email/message/:messageId/read
   */
  .post('/message/:messageId/read', validEmailMessageIdParam, validReadActionBody, async (c) => {
    const user = c.get('user');
    const { messageId } = c.req.valid('param');
    const { read } = c.req.valid('json');

    const message = await setMessageReadForUser({ userId: user.id, messageId, read });
    return c.json({ message });
  })
  // --- Attachments ------------------------------------------------------
  /**
   * [GET] /email/message/:messageId/attachments
   * Lists attachment metadata (never persisted, resolved live).
   */
  .get('/message/:messageId/attachments', validEmailMessageIdParam, async (c) => {
    const user = c.get('user');
    const { messageId } = c.req.valid('param');

    const attachments = await listEmailMessageAttachmentsForUser({ userId: user.id, messageId });
    return c.json({ attachments });
  })
  /**
   * [GET] /email/message/:messageId/attachment/:attachmentId
   * Streams the attachment bytes straight from Gmail.
   */
  .get('/message/:messageId/attachment/:attachmentId', validEmailAttachmentParams, async (c) => {
    const user = c.get('user');
    const { messageId, attachmentId } = c.req.valid('param');

    const file = await downloadEmailAttachmentForUser({ userId: user.id, messageId, attachmentId });

    return c.body(new Uint8Array(file.data), 200, {
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
    });
  })
  // --- Threads ----------------------------------------------------------
  /**
   * [GET] /email/thread
   */
  .get('/thread', validEmailThreadListQuery, async (c) => {
    const user = c.get('user');
    const query = c.req.valid('query');

    const result = await listEmailThreadsForUser({ userId: user.id, ...query });
    return c.json(result);
  })
  /**
   * [GET] /email/thread/:threadId
   */
  .get('/thread/:threadId', validEmailThreadIdParam, async (c) => {
    const user = c.get('user');
    const { threadId } = c.req.valid('param');

    const detail = await getEmailThreadDetailForUser({ userId: user.id, threadId });
    return c.json(detail);
  })
  /**
   * [POST] /email/thread/:threadId/archive - loops the thread's message ids.
   */
  .post('/thread/:threadId/archive', validEmailThreadIdParam, validArchiveActionBody, async (c) => {
    const user = c.get('user');
    const { threadId } = c.req.valid('param');
    const { archived } = c.req.valid('json');

    const messages = await setThreadArchivedForUser({ userId: user.id, threadId, archived });
    return c.json({ messages });
  })
  /**
   * [POST] /email/thread/:threadId/trash - loops the thread's message ids.
   */
  .post('/thread/:threadId/trash', validEmailThreadIdParam, async (c) => {
    const user = c.get('user');
    const { threadId } = c.req.valid('param');

    const messages = await setThreadTrashedForUser({ userId: user.id, threadId });
    return c.json({ messages });
  })
  /**
   * [POST] /email/thread/:threadId/star - loops the thread's message ids.
   */
  .post('/thread/:threadId/star', validEmailThreadIdParam, validStarActionBody, async (c) => {
    const user = c.get('user');
    const { threadId } = c.req.valid('param');
    const { starred } = c.req.valid('json');

    const messages = await setThreadStarredForUser({ userId: user.id, threadId, starred });
    return c.json({ messages });
  })
  /**
   * [POST] /email/thread/:threadId/read - loops the thread's message ids.
   */
  .post('/thread/:threadId/read', validEmailThreadIdParam, validReadActionBody, async (c) => {
    const user = c.get('user');
    const { threadId } = c.req.valid('param');
    const { read } = c.req.valid('json');

    const messages = await setThreadReadForUser({ userId: user.id, threadId, read });
    return c.json({ messages });
  });
