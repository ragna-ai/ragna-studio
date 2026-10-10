// apps/api/src/services/email.service.ts

import type {
  Agent,
  EmailAccount,
  EmailAccountSyncState,
  EmailAutoDraftSender,
  EmailCategory,
  EmailDraft,
  EmailDraftAttachment,
  EmailDraftKind,
  EmailDraftStatus,
  EmailMessage,
  EmailMessageFolder,
  EmailParticipant,
  EmailThreadWithMessages,
  Media,
  NewEmailDraft,
  NewEmailMessageBody,
} from '@repo/database';
import {
  addEmailAutoDraftSender,
  createEmailAccount,
  createEmailCategory,
  createEmailDraft,
  deleteEmailAccountById,
  deleteEmailCategory,
  getAgentInPersonalWorkspace,
  getEmailAccountByUserId,
  getEmailCategoryById,
  getEmailDraftById,
  getEmailMessageById,
  getEmailMessageWithBodyById,
  getEmailThreadById,
  getEmailThreadByProviderThreadId,
  getMediaInPersonalWorkspace,
  isUniqueViolationError,
  listEmailAutoDraftSenders,
  listEmailCategoriesByAccountId,
  listEmailDraftsByAccountId,
  listEmailDraftsByThreadId,
  listEmailMessagesByThreadId,
  listEmailMessagesByThreadIds,
  listEmailThreads,
  listPendingEmailDraftsByAccountId,
  removeEmailAutoDraftSender,
  updateEmailAccountSettings,
  updateEmailCategory,
  updateEmailDraft,
  updateEmailMessageFlags,
  upsertEmailMessageBodies,
  upsertEmailMessageBody,
  upsertEmailMessagesByProviderMessageId,
  upsertEmailThreadByProviderThreadId,
} from '@repo/database';
import { logger } from '@repo/logger';
// `email_message_bodies.textBody` is the LLM-facing canonical text (plain-
// text part preferred, else markdown from HTML), same convention
// apps/worker/src/mail/message-body.ts uses for the classify/sync
// lazy-persist path. Both persistence paths below must stay byte-for-byte
// consistent with that worker helper.
import {
  buildReplyQuoteHtml,
  htmlToText,
  joinDraftContentWithQuote,
  textToHtml,
  toCanonicalText,
} from '@repo/mail/content';
import type {
  MailAddress,
  MailAttachmentContent,
  MailAttachmentInput,
  MailAttachmentMeta,
  MailProvider,
  MailProviderId,
  MailProviderKind,
  MailMessage as ProviderMailMessage,
  MailThread as ProviderMailThread,
  SendMailInput,
  SendMailResult,
  SendMailThreadingInput,
} from '@repo/mail/provider';
import { isMailNotFoundError } from '@repo/mail/provider';
import {
  EMAIL_DRAFT_JOB,
  EMAIL_SYNC_JOB,
  emailDraftJobSchema,
  emailSyncJobSchema,
  queue,
} from '@repo/queue';
import { downloadObjectBuffer } from '@repo/storage';
import { tryCatch } from '@repo/utils';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '../exceptions';
import { getMailProviderForConnectRequest, getMailProviderForUser } from './email-provider.service';

// Attachment bytes (and metadata) are never persisted,
// so a compose request's fresh uploads
// go straight into the outgoing mail without ever touching R2/@repo/media.
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024; // the provider's own cap, same for Gmail and Outlook

const TERMINAL_DRAFT_STATUSES: ReadonlySet<EmailDraftStatus> = new Set(['sent', 'discarded']);

// --- Account ----------------------------------------------------------

async function loadEmailAccount({ userId }: { userId: string }): Promise<EmailAccount> {
  const { error, data: account } = await tryCatch(() => getEmailAccountByUserId({ userId }));

  if (error !== null) {
    logger.error('Failed to load email account', error);
    throw new InternalServerErrorException('Failed to load email account');
  }

  if (!account) {
    throw new NotFoundException('Mailbox is not connected');
  }

  return account;
}

export interface EmailAccountStatusResponse {
  connected: boolean;
  account: {
    id: string;
    provider: MailProviderKind;
    email: string;
    defaultAgentId: string | null;
    syncState: EmailAccountSyncState;
    lastSyncedAt: Date | null;
  } | null;
}

function toAccountStatus(account: EmailAccount | null): EmailAccountStatusResponse {
  if (!account) {
    return { connected: false, account: null };
  }

  return {
    connected: true,
    account: {
      id: account.id,
      provider: account.provider,
      email: account.email,
      defaultAgentId: account.defaultAgentId,
      syncState: account.syncState,
      lastSyncedAt: account.lastSyncedAt,
    },
  };
}

/**
 * [GET] /email/account
 */
export async function getEmailAccountStatus({
  userId,
}: {
  userId: string;
}): Promise<EmailAccountStatusResponse> {
  const { error, data: account } = await tryCatch(() => getEmailAccountByUserId({ userId }));

  if (error !== null) {
    logger.error('Failed to load email account', error);
    throw new InternalServerErrorException('Failed to load email account');
  }

  return toAccountStatus(account);
}

// Superhuman-style default set: natural
// language descriptions the classifier prompt can use as-is. Every seeded
// category starts with autoDraft off; the user opts in per category.
const DEFAULT_EMAIL_CATEGORIES: ReadonlyArray<{
  name: string;
  description: string;
  color: string;
}> = [
  {
    name: 'To Respond',
    description: 'Emails that need a personal reply from you.',
    color: '#ef4444',
  },
  {
    name: 'FYI',
    description: "Emails worth reading but that don't need a reply.",
    color: '#3b82f6',
  },
  {
    name: 'Newsletters',
    description: 'Recurring newsletters and content digests you are subscribed to.',
    color: '#8b5cf6',
  },
  {
    name: 'Marketing',
    description: 'Promotional and marketing emails from brands and services.',
    color: '#f59e0b',
  },
  {
    name: 'Notifications',
    description: 'Automated notifications and receipts from apps and services.',
    color: '#6b7280',
  },
];

/** [POST] /email/account/connect */
export async function connectEmailAccount({
  userId,
  provider: providerKind,
}: {
  userId: string;
  provider: MailProviderKind;
}): Promise<EmailAccount> {
  const { data: existing } = await tryCatch(() => getEmailAccountByUserId({ userId }));

  if (existing) {
    throw new BadRequestException('A mailbox is already connected');
  }

  const provider = await getMailProviderForConnectRequest({ userId, provider: providerKind });

  const { error: profileError, data: profile } = await tryCatch(() => provider.getProfile());

  if (profileError !== null || !profile) {
    logger.error('Failed to read mailbox profile while connecting', profileError);
    throw new BadRequestException(
      'Failed to read your mailbox profile. Try reconnecting your account',
    );
  }

  const { error, data: account } = await tryCatch(() =>
    createEmailAccount({ userId, provider: providerKind, email: profile.emailAddress }),
  );

  if (error !== null || !account) {
    logger.error('Failed to create email account', error);
    throw new InternalServerErrorException('Failed to connect your mailbox');
  }

  const { error: categoriesError } = await tryCatch(() =>
    Promise.all(
      DEFAULT_EMAIL_CATEGORIES.map((category) =>
        createEmailCategory({
          accountId: account.id,
          name: category.name,
          description: category.description,
          color: category.color,
          autoDraft: false,
        }),
      ),
    ),
  );

  if (categoriesError !== null) {
    // Not fatal: the account is connected either way, the user can add
    // categories by hand from email settings if the seed failed.
    logger.error('Failed to seed default email categories', categoriesError);
  }

  const { error: enqueueError } = await tryCatch(() =>
    queue.emailSync().add(EMAIL_SYNC_JOB, emailSyncJobSchema.parse({ accountId: account.id })),
  );

  if (enqueueError !== null) {
    logger.error('Failed to enqueue initial email sync', enqueueError);
  }

  return account;
}

// [POST] /email/account/disconnect. Cascades to threads/messages/etc; the linked social account itself stays untouched.
export async function disconnectEmailAccount({ userId }: { userId: string }): Promise<void> {
  const account = await loadEmailAccount({ userId });

  const { error } = await tryCatch(() => deleteEmailAccountById({ id: account.id }));

  if (error !== null) {
    logger.error('Failed to disconnect email account', error);
    throw new InternalServerErrorException('Failed to disconnect your mailbox');
  }
}

/**
 * [POST] /email/account/sync
 * Manual "Sync now". Enqueues the exact same job the sync cron would, with
 * the same jobId convention (accountId) so this dedupes against an
 * already-queued/running cron sync instead of stacking a second one
 * (apps/worker/src/crons/email-sync.cron.ts: "adding a job with an id
 * that's already waiting/active is a no-op"). No forced full resync - the
 * worker reads the stored cursor same as always. Returns the account's
 * current syncState so the client can show "already syncing" immediately.
 */
export async function syncEmailAccountNowForUser({
  userId,
}: {
  userId: string;
}): Promise<EmailAccountStatusResponse['account']> {
  const account = await loadEmailAccount({ userId });

  const { error } = await tryCatch(() =>
    queue.emailSync().add(EMAIL_SYNC_JOB, emailSyncJobSchema.parse({ accountId: account.id }), {
      jobId: account.id,
    }),
  );

  if (error !== null) {
    logger.error('Failed to enqueue manual email sync', error);
    throw new InternalServerErrorException('Failed to start sync');
  }

  return toAccountStatus(account).account;
}

/**
 * [PATCH] /email/account/settings
 */
export async function updateEmailAccountSettingsForUser({
  userId,
  defaultAgentId,
}: {
  userId: string;
  defaultAgentId?: string | null;
}): Promise<EmailAccount> {
  const account = await loadEmailAccount({ userId });

  if (defaultAgentId) {
    await assertPrivateWorkspaceAgent({ userId, agentId: defaultAgentId });
  }

  const { error, data: updated } = await tryCatch(() =>
    updateEmailAccountSettings({ id: account.id, defaultAgentId: defaultAgentId ?? null }),
  );

  if (error !== null || !updated) {
    logger.error('Failed to update email account settings', error);
    throw new InternalServerErrorException('Failed to update email settings');
  }

  return updated;
}

// Mail lives in the user's private workspace: a draft agent from anywhere else is a foreign reference.
async function assertPrivateWorkspaceAgent({
  userId,
  agentId,
}: {
  userId: string;
  agentId: string;
}): Promise<Agent> {
  const { error, data: agent } = await tryCatch(() =>
    getAgentInPersonalWorkspace({ agentId, userId }),
  );

  if (error !== null) {
    logger.error('Failed to load agent', error);
    throw new InternalServerErrorException('Failed to load agent');
  }

  if (!agent) {
    throw new NotFoundException('Agent not found');
  }

  return agent;
}

// --- Categories ---------------------------------------------------------

/**
 * [GET] /email/category
 */
export async function listEmailCategoriesForUser({
  userId,
}: {
  userId: string;
}): Promise<EmailCategory[]> {
  const account = await loadEmailAccount({ userId });

  const { error, data: categories } = await tryCatch(() =>
    listEmailCategoriesByAccountId({ accountId: account.id }),
  );

  if (error !== null || !categories) {
    logger.error('Failed to list email categories', error);
    throw new InternalServerErrorException('Failed to list email categories');
  }

  return categories;
}

/**
 * [POST] /email/category
 */
export async function createEmailCategoryForUser({
  userId,
  name,
  description,
  color,
  autoDraft,
}: {
  userId: string;
  name: string;
  description?: string;
  color: string;
  autoDraft?: boolean;
}): Promise<EmailCategory> {
  const account = await loadEmailAccount({ userId });

  const { error, data: category } = await tryCatch(() =>
    createEmailCategory({
      accountId: account.id,
      name,
      description: description ?? '',
      color,
      autoDraft: autoDraft ?? false,
    }),
  );

  if (error !== null) {
    if (isUniqueViolationError(error)) {
      throw new BadRequestException(`A category named "${name}" already exists`);
    }

    logger.error('Failed to create email category', error);
    throw new InternalServerErrorException('Failed to create email category');
  }

  if (!category) {
    throw new InternalServerErrorException('Failed to create email category');
  }

  return category;
}

/**
 * [PATCH] /email/category/:categoryId
 */
export async function updateEmailCategoryForUser({
  userId,
  categoryId,
  name,
  description,
  color,
  autoDraft,
}: {
  userId: string;
  categoryId: string;
  name?: string;
  description?: string;
  color?: string;
  autoDraft?: boolean;
}): Promise<EmailCategory> {
  const account = await loadEmailAccount({ userId });

  const { error, data: updated } = await tryCatch(() =>
    updateEmailCategory({
      id: categoryId,
      accountId: account.id,
      name,
      description,
      color,
      autoDraft,
    }),
  );

  if (error !== null) {
    if (name !== undefined && isUniqueViolationError(error)) {
      throw new BadRequestException(`A category named "${name}" already exists`);
    }

    logger.error('Failed to update email category', error);
    throw new InternalServerErrorException('Failed to update email category');
  }

  if (!updated) {
    throw new NotFoundException('Category not found');
  }

  return updated;
}

/**
 * [DELETE] /email/category/:categoryId
 * Messages classified into this category keep their row; categoryId just
 * turns null (FK onDelete: 'set null', email.schema.ts).
 */
export async function deleteEmailCategoryForUser({
  userId,
  categoryId,
}: {
  userId: string;
  categoryId: string;
}): Promise<void> {
  const account = await loadEmailAccount({ userId });

  const { error, data: existing } = await tryCatch(() =>
    getEmailCategoryById({ id: categoryId, accountId: account.id }),
  );

  if (error !== null) {
    logger.error('Failed to load email category', error);
    throw new InternalServerErrorException('Failed to load email category');
  }

  if (!existing) {
    throw new NotFoundException('Category not found');
  }

  await tryCatch(() => deleteEmailCategory({ id: categoryId, accountId: account.id }));
}

// --- Auto-draft senders ---------------------------------------------------

/**
 * [GET] /email/auto-draft-sender
 */
export async function listAutoDraftSendersForUser({
  userId,
}: {
  userId: string;
}): Promise<EmailAutoDraftSender[]> {
  const account = await loadEmailAccount({ userId });

  const { error, data: senders } = await tryCatch(() =>
    listEmailAutoDraftSenders({ accountId: account.id }),
  );

  if (error !== null || !senders) {
    logger.error('Failed to list auto-draft senders', error);
    throw new InternalServerErrorException('Failed to list auto-draft senders');
  }

  return senders;
}

/**
 * [POST] /email/auto-draft-sender
 */
export async function addAutoDraftSenderForUser({
  userId,
  senderEmail,
}: {
  userId: string;
  senderEmail: string;
}): Promise<EmailAutoDraftSender> {
  const account = await loadEmailAccount({ userId });

  const { error, data: sender } = await tryCatch(() =>
    addEmailAutoDraftSender({ accountId: account.id, senderEmail }),
  );

  if (error !== null) {
    if (isUniqueViolationError(error)) {
      throw new BadRequestException(`"${senderEmail}" is already on the auto-draft list`);
    }

    logger.error('Failed to add auto-draft sender', error);
    throw new InternalServerErrorException('Failed to add auto-draft sender');
  }

  if (!sender) {
    throw new InternalServerErrorException('Failed to add auto-draft sender');
  }

  return sender;
}

/**
 * [DELETE] /email/auto-draft-sender/:senderId
 * email-auto-draft-sender.repo.ts has no get-by-id lookup, only a list and
 * a scoped delete; the list (small, per-account) doubles as the existence
 * check so a bad id still 404s instead of silently no-op'ing.
 */
export async function removeAutoDraftSenderForUser({
  userId,
  senderId,
}: {
  userId: string;
  senderId: string;
}): Promise<void> {
  const account = await loadEmailAccount({ userId });

  const { error, data: senders } = await tryCatch(() =>
    listEmailAutoDraftSenders({ accountId: account.id }),
  );

  if (error !== null || !senders) {
    logger.error('Failed to load auto-draft senders', error);
    throw new InternalServerErrorException('Failed to load auto-draft senders');
  }

  if (!senders.some((sender) => sender.id === senderId)) {
    throw new NotFoundException('Sender not found');
  }

  await tryCatch(() => removeEmailAutoDraftSender({ id: senderId, accountId: account.id }));
}

// --- Threads / messages ---------------------------------------------------

export type EmailFolder = 'inbox' | 'archived' | 'trashed' | 'starred' | 'sent';

interface FolderThreadFilter {
  folder?: EmailMessageFolder;
  excludeFolders?: EmailMessageFolder[];
  isStarred?: boolean;
}

// `default` excludes trash/spam/draft too, same as inbox/archived; "trashed" is the one view that doesn't.
function resolveFolderFilter(folder: EmailFolder | undefined): FolderThreadFilter {
  switch (folder) {
    case 'inbox':
      return { folder: 'inbox', excludeFolders: ['trash', 'spam', 'draft'] };
    case 'archived':
      return { folder: 'archive', excludeFolders: ['inbox', 'trash', 'spam', 'draft'] };
    case 'trashed':
      return { folder: 'trash' };
    case 'sent':
      return { folder: 'sent' };
    case 'starred':
      return { isStarred: true };
    default:
      return { excludeFolders: ['trash', 'spam', 'draft'] };
  }
}

export interface EmailThreadSummary {
  id: string;
  subject: string | null;
  snippet: string | null;
  lastMessageAt: Date | null;
  participants: EmailParticipant[];
  // Union of every message's labelIds in the thread, for the label chips in
  // the list view.
  labelIds: string[];
  categoryId: string | null;
  isUnread: boolean;
  // Any message in the thread is starred - same "any" semantics as
  // isUnread - so the web star toggle reads correctly in every folder, not
  // just the starred one.
  isStarred: boolean;
  messageCount: number;
}

async function hydrateThreadSummary({
  thread,
  messages,
}: {
  thread: {
    id: string;
    subject: string | null;
    snippet: string | null;
    lastMessageAt: Date | null;
    participants: EmailParticipant[];
  };
  messages?: EmailMessage[];
}): Promise<EmailThreadSummary> {
  let threadMessages = messages;

  if (!threadMessages) {
    const { error, data } = await tryCatch(() =>
      listEmailMessagesByThreadId({ threadId: thread.id }),
    );

    if (error !== null || !data) {
      logger.error('Failed to load thread messages', error);
      throw new InternalServerErrorException('Failed to load thread');
    }

    threadMessages = data;
  }

  const labelIds = Array.from(new Set(threadMessages.flatMap((message) => message.labelIds)));
  const isUnread = threadMessages.some((message) => message.isUnread);
  const isStarred = threadMessages.some((message) => message.isStarred);
  // Most recent *classified* message's category represents the thread in
  // the list/detail views; classification runs per-message but a thread
  // reads as "one card". Scanning back from the newest message (rather than
  // just reading .at(-1)) matters because the newest message is often one
  // the classifier never touches, e.g. the account's own SENT reply
  // (isNonClassifiableMessage, apps/worker/src/mail/email-sync.service.ts) -
  // that message's categoryId is permanently null, which would otherwise
  // hide an earlier message's real classification.
  const categoryId =
    threadMessages.findLast((message) => message.categoryId !== null)?.categoryId ?? null;

  return {
    id: thread.id,
    subject: thread.subject,
    snippet: thread.snippet,
    lastMessageAt: thread.lastMessageAt,
    participants: thread.participants,
    labelIds,
    categoryId,
    isUnread,
    isStarred,
    messageCount: threadMessages.length,
  };
}

export interface EmailThreadListResponse {
  threads: EmailThreadSummary[];
  hasMore: boolean;
}

// [GET] /email/thread. No total-count query on the repo side, so pagination fetches one extra row to derive `hasMore`.
export async function listEmailThreadsForUser({
  userId,
  categoryId,
  labelId,
  folder,
  unreadOnly,
  starredOnly,
  dateFrom,
  dateTo,
  page,
  limit,
}: {
  userId: string;
  categoryId?: string;
  labelId?: string;
  folder?: EmailFolder;
  unreadOnly?: boolean;
  starredOnly?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  limit: number;
}): Promise<EmailThreadListResponse> {
  const account = await loadEmailAccount({ userId });
  const offset = (page - 1) * limit;

  const folderFilter = resolveFolderFilter(folder);
  const effectiveIsStarred = folderFilter.isStarred || starredOnly ? true : undefined;

  const { error, data: rows } = await tryCatch(() =>
    listEmailThreads({
      accountId: account.id,
      categoryId,
      labelId,
      folder: folderFilter.folder,
      excludeFolders: folderFilter.excludeFolders,
      isStarred: effectiveIsStarred,
      isUnread: unreadOnly ? true : undefined,
      dateFrom,
      dateTo,
      limit: limit + 1,
      offset,
    }),
  );

  if (error !== null || !rows) {
    logger.error('Failed to list email threads', error);
    throw new InternalServerErrorException('Failed to list email threads');
  }

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);

  const { error: messagesError, data: pageMessages } = await tryCatch(() =>
    listEmailMessagesByThreadIds({ threadIds: pageRows.map((thread) => thread.id) }),
  );

  if (messagesError !== null || !pageMessages) {
    logger.error('Failed to load thread messages', messagesError);
    throw new InternalServerErrorException('Failed to load thread');
  }

  const messagesByThreadId = new Map<string, EmailMessage[]>();
  for (const message of pageMessages) {
    const threadMessages = messagesByThreadId.get(message.threadId) ?? [];
    threadMessages.push(message);
    messagesByThreadId.set(message.threadId, threadMessages);
  }

  const threads = await Promise.all(
    pageRows.map((thread) =>
      hydrateThreadSummary({
        thread,
        messages: messagesByThreadId.get(thread.id) ?? [],
      }),
    ),
  );

  return { threads, hasMore };
}

export interface EmailMessageDetail {
  id: string;
  from: EmailParticipant;
  to: EmailParticipant[];
  cc: EmailParticipant[];
  subject: string | null;
  sentAt: Date;
  isUnread: boolean;
  isStarred: boolean;
  labelIds: string[];
  categoryId: string | null;
  needsReply: boolean;
  body: { text: string | null; html: string | null };
}

export interface EmailThreadDetailResponse {
  thread: EmailThreadSummary;
  messages: EmailMessageDetail[];
}

// [GET] /email/thread/:threadId. A missing body is live-fetched and persisted; a thread with no gaps never calls the provider.
export async function getEmailThreadDetailForUser({
  userId,
  threadId,
}: {
  userId: string;
  threadId: string;
}): Promise<EmailThreadDetailResponse> {
  const account = await loadEmailAccount({ userId });
  const thread = await requireOwnedThread({ accountId: account.id, threadId });

  const { error, data: messages } = await tryCatch(() =>
    listEmailMessagesByThreadId({ threadId: thread.id }),
  );

  if (error !== null || !messages) {
    logger.error('Failed to list thread messages', error);
    throw new InternalServerErrorException('Failed to load thread');
  }

  const textByMessageId = new Map<string, string | null>();
  const htmlByMessageId = new Map<string, string | null>();
  for (const message of messages) {
    if (message.body) {
      textByMessageId.set(message.id, message.body.textBody);
      htmlByMessageId.set(message.id, message.body.htmlBody);
    }
  }

  const gapMessages = messages.filter((message) => !message.body);

  if (gapMessages.length > 0) {
    const provider = await getMailProviderForUser({ userId });
    const { error: fetchError, data: liveThread } = await tryCatch(() =>
      provider.fetchThread(thread.providerThreadId),
    );

    if (fetchError !== null || !liveThread) {
      logger.error(`Failed to live-fetch thread ${thread.providerThreadId}`, fetchError);
      throw new InternalServerErrorException('Failed to load thread from the mail provider');
    }

    const liveByProviderId = new Map(liveThread.messages.map((message) => [message.id, message]));

    const gapBodies: NewEmailMessageBody[] = [];

    for (const message of gapMessages) {
      const live = liveByProviderId.get(message.providerMessageId);
      if (!live) continue;

      const text = toCanonicalText(live.body);

      gapBodies.push({ messageId: message.id, textBody: text, htmlBody: live.body.html });
      textByMessageId.set(message.id, text);
      htmlByMessageId.set(message.id, live.body.html);
    }

    const { error: bodiesError } = await tryCatch(() => upsertEmailMessageBodies(gapBodies));
    if (bodiesError !== null) {
      logger.error(`Failed to persist bodies of thread ${thread.providerThreadId}`, bodiesError);
    }
  }

  // Deliberately a pure read: GET must stay idempotent.
  // Marking a thread read on open was tried and reverted - it made this
  // endpoint mutate state on an incidental refetch, silently undoing an
  // explicit "mark unread". Marking read is the client's job, through the
  // existing POST /email/thread/:threadId/read.
  const threadSummary = await hydrateThreadSummary({ thread, messages });

  return {
    thread: threadSummary,
    // A text-only message (no HTML part at all) has a null htmlBody here,
    // not just an unsynced one - fall back to textToHtml the same way
    // resolveMessageHtmlForQuote does, so the reading pane (which only
    // renders `html`) still shows something instead of a blank iframe.
    messages: messages.map((message) => {
      const text = textByMessageId.get(message.id) ?? null;
      const html = htmlByMessageId.get(message.id) ?? (text ? textToHtml(text) : null);

      return {
        id: message.id,
        from: message.from,
        to: message.to,
        cc: message.cc ?? [],
        subject: message.subject,
        sentAt: message.sentAt,
        isUnread: message.isUnread,
        isStarred: message.isStarred,
        labelIds: message.labelIds,
        categoryId: message.categoryId,
        needsReply: message.needsReply,
        body: { text, html },
      };
    }),
  };
}

async function requireOwnedThread({
  accountId,
  threadId,
}: {
  accountId: string;
  threadId: string;
}): Promise<EmailThreadWithMessages> {
  const { error, data: thread } = await tryCatch(() =>
    getEmailThreadById({ id: threadId, accountId }),
  );

  if (error !== null) {
    logger.error('Failed to load email thread', error);
    throw new InternalServerErrorException('Failed to load thread');
  }

  if (!thread) {
    throw new NotFoundException('Thread not found');
  }

  return thread;
}

async function requireOwnedMessage({
  accountId,
  messageId,
}: {
  accountId: string;
  messageId: string;
}): Promise<EmailMessage> {
  const { error, data: message } = await tryCatch(() => getEmailMessageById({ id: messageId }));

  if (error !== null) {
    logger.error('Failed to load email message', error);
    throw new InternalServerErrorException('Failed to load message');
  }

  if (!message || message.accountId !== accountId) {
    throw new NotFoundException('Message not found');
  }

  return message;
}

// Used by the search fallback for a thread id we haven't indexed yet.
async function persistFetchedThread({
  accountId,
  mailThread,
}: {
  accountId: string;
  mailThread: ProviderMailThread;
}): Promise<EmailThreadWithMessages> {
  const lastMessage = mailThread.messages.at(-1);
  const participants = uniqueParticipants(mailThread.messages);

  const { error: threadError, data: thread } = await tryCatch(() =>
    upsertEmailThreadByProviderThreadId({
      accountId,
      providerThreadId: mailThread.id,
      subject: lastMessage?.subject ?? null,
      snippet: lastMessage?.snippet ?? null,
      lastMessageAt: lastMessage?.date ?? null,
      participants,
    }),
  );

  if (threadError !== null || !thread) {
    logger.error(`Failed to persist thread ${mailThread.id}`, threadError);
    throw new InternalServerErrorException('Failed to load thread');
  }

  const { error: messagesError, data: upsertedMessages } = await tryCatch(() =>
    upsertEmailMessagesByProviderMessageId(
      mailThread.messages.map((providerMessage) => ({
        accountId,
        threadId: thread.id,
        providerMessageId: providerMessage.id,
        from: providerMessage.from
          ? toEmailParticipant(providerMessage.from)
          : { name: null, email: '' },
        to: providerMessage.to.map(toEmailParticipant),
        cc: providerMessage.cc.map(toEmailParticipant),
        subject: providerMessage.subject,
        snippet: providerMessage.snippet,
        sentAt: providerMessage.date,
        isUnread: providerMessage.unread,
        isStarred: providerMessage.starred,
        folder: providerMessage.folder,
        labelIds: providerMessage.labelIds,
      })),
    ),
  );

  if (messagesError !== null || !upsertedMessages) {
    logger.error(`Failed to persist messages of thread ${mailThread.id}`, messagesError);
    throw new InternalServerErrorException('Failed to load thread');
  }

  const messageByProviderId = new Map(
    upsertedMessages.map((message) => [message.providerMessageId, message]),
  );
  const messages: EmailMessage[] = [];
  const bodies: NewEmailMessageBody[] = [];

  for (const providerMessage of mailThread.messages) {
    const message = messageByProviderId.get(providerMessage.id);
    if (!message) continue;

    messages.push(message);
    bodies.push({
      messageId: message.id,
      textBody: toCanonicalText(providerMessage.body),
      htmlBody: providerMessage.body.html,
    });
  }

  const { error: bodiesError } = await tryCatch(() => upsertEmailMessageBodies(bodies));
  if (bodiesError !== null) {
    logger.error(`Failed to persist bodies of thread ${mailThread.id}`, bodiesError);
  }

  return { ...thread, messages };
}

function toEmailParticipant(address: MailAddress): EmailParticipant {
  return { name: address.name ?? null, email: address.address };
}

function uniqueParticipants(messages: ProviderMailMessage[]): EmailParticipant[] {
  const byEmail = new Map<string, EmailParticipant>();

  for (const message of messages) {
    if (message.from) byEmail.set(message.from.address, toEmailParticipant(message.from));
    for (const to of message.to) byEmail.set(to.address, toEmailParticipant(to));
  }

  return Array.from(byEmail.values());
}

// --- Search -----------------------------------------------------------

export interface EmailSearchResponse {
  threads: EmailThreadSummary[];
  nextPageToken: string | null;
}

// [GET] /email/search. Proxies the provider's native search syntax, hydrating results against the local index.
export async function searchEmailForUser({
  userId,
  query,
  pageToken,
}: {
  userId: string;
  query: string;
  pageToken?: string;
}): Promise<EmailSearchResponse> {
  const account = await loadEmailAccount({ userId });
  const provider = await getMailProviderForUser({ userId });

  const { error, data: result } = await tryCatch(() => provider.search(query, pageToken ?? null));

  if (error !== null || !result) {
    logger.error('Failed to search email', error);
    throw new InternalServerErrorException('Failed to search email');
  }

  const threads = await Promise.all(
    result.threadIds.map((providerThreadId) =>
      resolveSearchThread({ account, provider, providerThreadId }),
    ),
  );

  return { threads, nextPageToken: result.nextPageToken };
}

async function resolveSearchThread({
  account,
  provider,
  providerThreadId,
}: {
  account: EmailAccount;
  provider: MailProvider;
  providerThreadId: MailProviderId;
}): Promise<EmailThreadSummary> {
  const { data: local } = await tryCatch(() =>
    getEmailThreadByProviderThreadId({ accountId: account.id, providerThreadId }),
  );

  if (local) {
    return hydrateThreadSummary({ thread: local });
  }

  const { error, data: liveThread } = await tryCatch(() => provider.fetchThread(providerThreadId));

  if (error !== null || !liveThread) {
    logger.error(`Failed to live-fetch search result thread ${providerThreadId}`, error);
    throw new InternalServerErrorException('Failed to load a search result');
  }

  const persisted = await persistFetchedThread({ accountId: account.id, mailThread: liveThread });
  return hydrateThreadSummary({
    thread: persisted,
    messages: persisted.messages,
  });
}

// --- Mailbox actions --------------------------------------------------

type MailboxAction = (
  provider: MailProvider,
  providerMessageId: MailProviderId,
) => ReturnType<MailProvider['setRead']>;

async function applyMessageAction({
  userId,
  messageId,
  action,
}: {
  userId: string;
  messageId: string;
  action: MailboxAction;
}): Promise<EmailMessage> {
  const account = await loadEmailAccount({ userId });
  const message = await requireOwnedMessage({ accountId: account.id, messageId });
  const provider = await getMailProviderForUser({ userId });

  const { error, data: result } = await tryCatch(() => action(provider, message.providerMessageId));

  if (error !== null || !result) {
    logger.error(`Failed to apply mailbox action to message ${messageId}`, error);
    throw new InternalServerErrorException('Failed to update message');
  }

  const { error: updateError, data: updated } = await tryCatch(() =>
    updateEmailMessageFlags({
      id: message.id,
      labelIds: result.labelIds,
      folder: result.folder,
      isUnread: result.unread,
      isStarred: result.starred,
    }),
  );

  if (updateError !== null) {
    logger.error(`Failed to persist mailbox action for message ${messageId}`, updateError);
  }

  return updated ?? message;
}

// Shared by applyThreadAction (every message on a thread) and
// getEmailThreadDetailForUser's best-effort mark-as-read-on-open (only the
// messages that are actually unread): applies
// `action` to each message via the provider, then persists whatever the
// provider actually reports back. Any single message's failure (provider
// call or the local persist) is logged and that message falls back to its
// last-known row instead of failing the whole batch.
async function applyActionToMessages({
  provider,
  messages,
  action,
}: {
  provider: MailProvider;
  messages: EmailMessage[];
  action: MailboxAction;
}): Promise<EmailMessage[]> {
  return Promise.all(
    messages.map(async (message) => {
      const { error: actionError, data: result } = await tryCatch(() =>
        action(provider, message.providerMessageId),
      );

      if (actionError !== null || !result) {
        logger.error(`Failed to apply mailbox action to message ${message.id}`, actionError);
        return message;
      }

      const { error: updateError, data: updated } = await tryCatch(() =>
        updateEmailMessageFlags({
          id: message.id,
          labelIds: result.labelIds,
          folder: result.folder,
          isUnread: result.unread,
          isStarred: result.starred,
        }),
      );

      if (updateError !== null) {
        logger.error(`Failed to persist mailbox action for message ${message.id}`, updateError);
      }

      return updated ?? message;
    }),
  );
}

async function applyThreadAction({
  userId,
  threadId,
  action,
}: {
  userId: string;
  threadId: string;
  action: MailboxAction;
}): Promise<EmailMessage[]> {
  const account = await loadEmailAccount({ userId });
  const thread = await requireOwnedThread({ accountId: account.id, threadId });

  const { error, data: messages } = await tryCatch(() =>
    listEmailMessagesByThreadId({ threadId: thread.id }),
  );

  if (error !== null || !messages) {
    logger.error('Failed to load thread messages for action', error);
    throw new InternalServerErrorException('Failed to update thread');
  }

  if (messages.length === 0) {
    return [];
  }

  const provider = await getMailProviderForUser({ userId });

  return applyActionToMessages({ provider, messages, action });
}

/** [POST] /email/message/:messageId/archive */
export function setMessageArchivedForUser(params: {
  userId: string;
  messageId: string;
  archived: boolean;
}) {
  return applyMessageAction({
    userId: params.userId,
    messageId: params.messageId,
    action: (provider, id) => provider.setArchived(id, params.archived),
  });
}

/** [POST] /email/message/:messageId/trash */
export function setMessageTrashedForUser(params: {
  userId: string;
  messageId: string;
  trashed: boolean;
}) {
  return applyMessageAction({
    userId: params.userId,
    messageId: params.messageId,
    action: (provider, id) => provider.setTrashed(id, params.trashed),
  });
}

/** [POST] /email/message/:messageId/star */
export function setMessageStarredForUser(params: {
  userId: string;
  messageId: string;
  starred: boolean;
}) {
  return applyMessageAction({
    userId: params.userId,
    messageId: params.messageId,
    action: (provider, id) => provider.setStarred(id, params.starred),
  });
}

/** [POST] /email/message/:messageId/read */
export function setMessageReadForUser(params: {
  userId: string;
  messageId: string;
  read: boolean;
}) {
  return applyMessageAction({
    userId: params.userId,
    messageId: params.messageId,
    action: (provider, id) => provider.setRead(id, params.read),
  });
}

/** [POST] /email/thread/:threadId/archive - loops the thread's message ids. */
export function setThreadArchivedForUser(params: {
  userId: string;
  threadId: string;
  archived: boolean;
}) {
  return applyThreadAction({
    userId: params.userId,
    threadId: params.threadId,
    action: (provider, id) => provider.setArchived(id, params.archived),
  });
}

/** [POST] /email/thread/:threadId/trash - loops the thread's message ids. */
export function setThreadTrashedForUser(params: {
  userId: string;
  threadId: string;
  trashed: boolean;
}) {
  return applyThreadAction({
    userId: params.userId,
    threadId: params.threadId,
    action: (provider, id) => provider.setTrashed(id, params.trashed),
  });
}

export interface BulkTrashThreadResult {
  threadId: string;
  ok: boolean;
}

/**
 * [POST] /email/thread/bulk/trash
 * Loops the requested thread ids, trashing each one through the same
 * per-thread path as `setThreadTrashedForUser`. Every id is wrapped in its
 * own `tryCatch` so one bad id (not found, provider error) doesn't reject
 * the whole batch - same tolerant, log-and-continue precedent as
 * `applyActionToMessages`.
 */
export async function bulkSetThreadsTrashedForUser({
  userId,
  threadIds,
}: {
  userId: string;
  threadIds: string[];
}): Promise<BulkTrashThreadResult[]> {
  return Promise.all(
    threadIds.map(async (threadId) => {
      const { error } = await tryCatch(() =>
        setThreadTrashedForUser({ userId, threadId, trashed: true }),
      );

      if (error !== null) {
        logger.error(`Failed to bulk-trash thread ${threadId}`, error);
        return { threadId, ok: false };
      }

      return { threadId, ok: true };
    }),
  );
}

/** [POST] /email/thread/:threadId/star - loops the thread's message ids. */
export function setThreadStarredForUser(params: {
  userId: string;
  threadId: string;
  starred: boolean;
}) {
  return applyThreadAction({
    userId: params.userId,
    threadId: params.threadId,
    action: (provider, id) => provider.setStarred(id, params.starred),
  });
}

/** [POST] /email/thread/:threadId/read - loops the thread's message ids. */
export function setThreadReadForUser(params: { userId: string; threadId: string; read: boolean }) {
  return applyThreadAction({
    userId: params.userId,
    threadId: params.threadId,
    action: (provider, id) => provider.setRead(id, params.read),
  });
}

// --- Compose / send --------------------------------------------------

function toMailAddress(email: string): MailAddress {
  return { address: email };
}

async function resolveThreading({
  provider,
  account,
  threadId,
  replyToMessageId,
}: {
  provider: MailProvider;
  account: EmailAccount;
  threadId?: string;
  replyToMessageId?: string;
}): Promise<SendMailThreadingInput | undefined> {
  if (!threadId && !replyToMessageId) {
    return undefined;
  }

  if (!threadId || !replyToMessageId) {
    throw new BadRequestException('threadId and replyToMessageId must be provided together');
  }

  const thread = await requireOwnedThread({ accountId: account.id, threadId });
  const message = await requireOwnedMessage({ accountId: account.id, messageId: replyToMessageId });

  if (message.threadId !== thread.id) {
    throw new BadRequestException('replyToMessageId does not belong to threadId');
  }

  // The RFC822 Message-ID header and References chain aren't stored on the
  // index row (only the provider's own message id is), so threading needs
  // one live metadata fetch at send time.
  const { error, data: fullMessage } = await tryCatch(() =>
    provider.fetchMessage(message.providerMessageId, 'full'),
  );

  if (error !== null || !fullMessage) {
    logger.error(`Failed to load message ${message.id} for reply threading`, error);
    throw new InternalServerErrorException('Failed to load the message being replied to');
  }

  if (!fullMessage.messageIdHeader) {
    throw new InternalServerErrorException('The message being replied to has no Message-ID header');
  }

  return {
    threadId: thread.providerThreadId,
    inReplyToMessageId: fullMessage.messageIdHeader,
    references: fullMessage.references,
    replyToProviderMessageId: message.providerMessageId,
  };
}

async function resolveAttachments({
  userId,
  mediaIds,
  files,
}: {
  userId: string;
  mediaIds?: string[];
  files?: File[];
}): Promise<MailAttachmentInput[]> {
  const attachments: MailAttachmentInput[] = [];

  for (const file of files ?? []) {
    if (file.size === 0) continue;
    const fileBytes = await file.arrayBuffer();
    attachments.push({
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      content: Buffer.from(fileBytes),
    });
  }

  if (mediaIds && mediaIds.length > 0) {
    const privateMedia = await loadPrivateWorkspaceMedia({ userId, mediaIds });
    for (const media of privateMedia) {
      const mediaAttachment = await downloadMediaAttachment(media);
      attachments.push(mediaAttachment);
    }
  }

  return attachments;
}

// Runs once on the merged attachment array, not per-source, so the budget covers whatever actually goes out.
function assertAttachmentsWithinBudget(attachments: MailAttachmentInput[]): void {
  const totalBytes = attachments.reduce(
    (sum, attachment) => sum + attachment.content.byteLength,
    0,
  );
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new BadRequestException('Attachments are larger than the 25 MB limit');
  }
}

// One query for all ids. Any id outside the private workspace rejects the whole request.
async function loadPrivateWorkspaceMedia({
  userId,
  mediaIds,
}: {
  userId: string;
  mediaIds: string[];
}): Promise<Media[]> {
  const { error, data: foundMedia } = await tryCatch(() =>
    getMediaInPersonalWorkspace({ ids: mediaIds, userId }),
  );

  if (error !== null || !foundMedia) {
    logger.error('Failed to load media for email attachments', error);
    throw new InternalServerErrorException('Failed to load attachment');
  }

  const mediaById = new Map(foundMedia.map((media) => [media.id, media]));
  const orderedMedia: Media[] = [];
  for (const mediaId of mediaIds) {
    const media = mediaById.get(mediaId);
    if (!media) {
      throw new BadRequestException('One of the selected attachments was not found');
    }
    orderedMedia.push(media);
  }

  return orderedMedia;
}

async function downloadMediaAttachment(media: Media): Promise<MailAttachmentInput> {
  const { error, data: object } = await tryCatch(() =>
    downloadObjectBuffer(media.bucket, media.storageKey),
  );

  if (error !== null || !object) {
    logger.error(`Failed to download media ${media.id} for email attachment`, error);
    throw new InternalServerErrorException('Failed to load attachment');
  }

  return { filename: media.filename, mimeType: media.mimeType, content: object.buffer };
}

// Marks every non-terminal draft on `threadId` that replies to
// `replyToMessageId` as sent, so the review UI stops offering it once the
// user has actually sent that reply (by hand or by sending the draft
// itself). email-draft.repo.ts has no "find by replyToMessageId" query, so
// this filters the thread's (already small) draft list in memory instead of
// asking for a new repo function.
async function markMatchingDraftsSent({
  accountId,
  threadId,
  replyToMessageId,
}: {
  accountId: string;
  threadId: string;
  replyToMessageId: string;
}): Promise<void> {
  const { data: threadDrafts } = await tryCatch(() =>
    listEmailDraftsByThreadId({ threadId, accountId }),
  );

  const matching = (threadDrafts ?? []).filter(
    (draft) =>
      draft.replyToMessageId === replyToMessageId && !TERMINAL_DRAFT_STATUSES.has(draft.status),
  );

  await Promise.all(
    matching.map((draft) =>
      tryCatch(() => updateEmailDraft({ id: draft.id, accountId, status: 'sent' })),
    ),
  );
}

export interface SendEmailInput {
  userId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  /** Local `email_threads.id` / `email_messages.id`; both required together for a reply. */
  threadId?: string;
  replyToMessageId?: string;
  mediaIds?: string[];
  files?: File[];
  /** Local `email_drafts.id`, marked `sent` once the send succeeds. */
  draftId?: string;
  /**
   * Final edited markdown for `draftId`, if the caller sent one (the user
   * may have edited the draft in the editor right before sending). Persisted
   * alongside the `sent` status update; the draft's own `content` column
   * otherwise keeps whatever the draft agent last wrote.
   */
  draftContent?: string;
  // Set when the draft already reached the provider: flushes+sends via updateDraft/sendDraft instead of plain send.
  providerDraftId?: string;
  /**
   * Pre-resolved attachment bytes to send alongside whatever `mediaIds`/
   * `files` resolve to, e.g. a draft's forwarded-attachment carry-over
   * (already fetched via `provider.getAttachment` by the caller).
   */
  extraAttachments?: MailAttachmentInput[];
}

export interface SendEmailResponse {
  messageId: string;
  threadId: string;
}

function assertSendableEmailRequest({
  to,
  html,
  text,
}: {
  to: string[];
  html?: string;
  text?: string;
}): void {
  if (to.length === 0) {
    throw new BadRequestException('At least one recipient is required');
  }

  if (!html && !text) {
    throw new BadRequestException('Email body is required');
  }
}

async function sendAsNewMessage({
  provider,
  sendInput,
}: {
  provider: MailProvider;
  sendInput: SendMailInput;
}): Promise<SendMailResult> {
  const { error, data: result } = await tryCatch(() => provider.send(sendInput));

  if (error !== null || !result) {
    logger.error('Failed to send email', error);
    throw new InternalServerErrorException('Failed to send email');
  }

  return result;
}

// Flushes the request's final content with updateDraft first, since the panel's debounced write-back may be stale.
async function sendViaExistingDraft({
  provider,
  providerDraftId,
  sendInput,
}: {
  provider: MailProvider;
  providerDraftId: MailProviderId;
  sendInput: SendMailInput;
}): Promise<SendMailResult> {
  const { error: updateError } = await tryCatch(() =>
    provider.updateDraft(providerDraftId, sendInput),
  );

  if (updateError !== null) {
    logger.error(`Failed to flush draft ${providerDraftId} before send`, updateError);
    throw new InternalServerErrorException('Failed to save the draft before sending');
  }

  const { error: sendError, data: result } = await tryCatch(() =>
    provider.sendDraft(providerDraftId),
  );

  if (sendError !== null || !result) {
    logger.error(`Failed to send draft ${providerDraftId}`, sendError);
    throw new InternalServerErrorException('Failed to send email');
  }

  return result;
}

/**
 * [POST] /email/send
 * Handles both new mail and replies: `input.thread` (resolved by
 * `resolveThreading`) is what tells the provider to thread the message.
 * The sent message is never hand-inserted into the local index; it lands
 * there via the next sync.
 */
export async function sendEmailForUser(input: SendEmailInput): Promise<SendEmailResponse> {
  const {
    userId,
    to,
    cc,
    bcc,
    subject,
    html,
    text,
    threadId,
    replyToMessageId,
    mediaIds,
    files,
    draftId,
    draftContent,
    providerDraftId,
    extraAttachments,
  } = input;

  assertSendableEmailRequest({ to, html, text });

  const account = await loadEmailAccount({ userId });
  const provider = await getMailProviderForUser({ userId });

  const thread = await resolveThreading({ provider, account, threadId, replyToMessageId });
  const resolvedAttachments = await resolveAttachments({ userId, mediaIds, files });
  const attachments = [...(extraAttachments ?? []), ...resolvedAttachments];
  assertAttachmentsWithinBudget(attachments);

  const sendInput: SendMailInput = {
    to: to.map(toMailAddress),
    cc: cc?.map(toMailAddress),
    bcc: bcc?.map(toMailAddress),
    subject,
    html,
    text,
    attachments: attachments.length > 0 ? attachments : undefined,
    thread,
  };

  const result = providerDraftId
    ? await sendViaExistingDraft({ provider, providerDraftId, sendInput })
    : await sendAsNewMessage({ provider, sendInput });

  if (draftId) {
    // One round trip for every field: updateEmailDraft treats an omitted
    // key as "leave untouched" (email-draft.repo.ts), so content is only
    // overwritten when the caller actually sent an edited version, and
    // providerDraftId is only cleared when this send actually consumed one
    // (the provider deletes the draft server-side, so the id no longer resolves).
    // `text` is written alongside `content` here too - the two must never
    // drift: prefer the
    // client's own `text` (its Tiptap `getText()`, sent alongside the same
    // edited `content`), falling back to the shared stripper only if a
    // caller sent `draftContent` without a paired `text`.
    await tryCatch(() =>
      updateEmailDraft({
        id: draftId,
        accountId: account.id,
        status: 'sent',
        ...(providerDraftId ? { providerDraftId: null } : {}),
        ...(draftContent !== undefined
          ? { content: draftContent, text: text ?? htmlToText(draftContent) }
          : {}),
      }),
    );
  }

  if (threadId && replyToMessageId) {
    await markMatchingDraftsSent({ accountId: account.id, threadId, replyToMessageId });
  }

  return { messageId: result.messageId, threadId: result.threadId };
}

// --- Drafts -------------------------------------------------------------

// Thrown by createEmailDraftForUser when the thread already has a
// non-terminal draft.
// Not an HTTPException: the 409 response carries the
// existing draft itself in its JSON body (same `{ draft }` envelope a
// successful create returns, so the client can read its `kind` and decide
// whether to offer a replace), not just a message, so the controller
// catches this and builds that response itself rather than going through
// the generic HTTPException -> `{ code, error }` path (apps/api/src/app.ts's
// onError).
export class ActiveDraftConflictError extends Error {
  constructor(public readonly draft: EmailDraft) {
    super('Thread already has an active draft');
  }
}

async function assertNoActiveDraftOnThread({
  accountId,
  threadId,
}: {
  accountId: string;
  threadId: string;
}): Promise<void> {
  const { data: threadDrafts } = await tryCatch(() =>
    listEmailDraftsByThreadId({ accountId, threadId }),
  );

  const active = (threadDrafts ?? []).find((draft) => !TERMINAL_DRAFT_STATUSES.has(draft.status));

  if (active) {
    throw new ActiveDraftConflictError(active);
  }
}

async function insertEmailDraft(values: NewEmailDraft): Promise<EmailDraft> {
  const { error, data: draft } = await tryCatch(() => createEmailDraft(values));

  if (error !== null || !draft) {
    logger.error('Failed to create email draft', error);
    throw new InternalServerErrorException('Failed to create draft');
  }

  return draft;
}

// Metadata only; content is re-fetched from the provider at write-back/send time (resolveDraftAttachmentContents).
async function resolveForwardAttachments({
  provider,
  message,
}: {
  provider: MailProvider;
  message: EmailMessage;
}): Promise<EmailDraftAttachment[]> {
  const { error, data: fullMessage } = await tryCatch(() =>
    provider.fetchMessage(message.providerMessageId, 'full'),
  );

  if (error !== null || !fullMessage) {
    logger.error(`Failed to load message ${message.id} for forward attachments`, error);
    throw new InternalServerErrorException('Failed to load the message being forwarded');
  }

  return fullMessage.body.attachments.map((attachment) => ({
    providerMessageId: message.providerMessageId,
    providerAttachmentId: attachment.attachmentId,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
    contentId: attachment.contentId ?? null,
    inline: attachment.inline,
  }));
}

// The message being replied to/forwarded may not have its HTML body
// persisted yet (sync persists bodies lazily, the same gap
// getEmailThreadDetailForUser fills for the thread view): fetch it live
// and persist it when that happens, instead of quoting an empty body. A
// message that turns out to have no HTML part at all (a plain-text-only
// email, `htmlBody`/`body.html` genuinely null rather than just unpersisted)
// falls back to `textToHtml`, not a markdown renderer: `toCanonicalText`
// prefers the plain-text MIME part, so this fallback almost always holds
// genuine plain text, and running a sender's own `#`/`-`/`>` characters
// through a markdown parser would misread them as syntax.
async function resolveMessageHtmlForQuote({
  provider,
  message,
}: {
  provider: MailProvider;
  message: EmailMessage;
}): Promise<string> {
  const { data: withBody } = await tryCatch(() => getEmailMessageWithBodyById({ id: message.id }));

  if (withBody?.body?.htmlBody) {
    return withBody.body.htmlBody;
  }

  const { error, data: liveMessage } = await tryCatch(() =>
    provider.fetchMessage(message.providerMessageId, 'full'),
  );

  if (error !== null || !liveMessage) {
    logger.error(`Failed to load message ${message.id} body for reply quoting`, error);
    throw new InternalServerErrorException('Failed to load the message being replied to');
  }

  // toCanonicalText returns null only for a genuinely empty body (no html,
  // no text); the quote then degrades to an empty quoted block rather than
  // failing the draft creation.
  const text = toCanonicalText(liveMessage.body) ?? '';

  await tryCatch(() =>
    upsertEmailMessageBody({
      messageId: message.id,
      textBody: text,
      htmlBody: liveMessage.body.html,
    }),
  );

  return liveMessage.body.html ?? textToHtml(text);
}

export interface ReplyDraftQuote {
  quotedHtml: string;
  quotedText: string;
}

// Server-side quoting (the API used to never append quotes server-side - that was
// right when a send was assembled in the browser, but a draft is now a
// persisted server object, so the quote has to be in the row at creation.
// Reuses the client's own helper
// so there is
// still exactly one implementation of the quote format, shared with
// apps/worker's AI draft push. `quotedText` is derived from the same HTML via
// `htmlToText` so the two can never drift relative to each other. The quote
// lives in its own `quotedHtml`/`quotedText` columns, separate from the
// user's own `content`/`text`.
async function buildReplyDraftQuote({
  provider,
  message,
}: {
  provider: MailProvider;
  message: EmailMessage;
}): Promise<ReplyDraftQuote> {
  const html = await resolveMessageHtmlForQuote({ provider, message });

  const content = buildReplyQuoteHtml({
    from: toMailAddressFromParticipant(message.from),
    date: message.sentAt,
    html,
  });

  return { quotedHtml: content, quotedText: htmlToText(content) };
}

/**
 * [POST] /email/draft
 * Creates the local row for one of the four compose entry points.
 * `new` seeds nothing;
 * `reply` seeds `to` from the replied-to message's sender only, never `cc`
 * (reply-all is not a kind - the client PATCHes `cc` in separately, so the
 * two must not fight); `forward` leaves `to` empty and seeds the forwarded
 * message's attachment metadata. Both `reply` and `forward` start `content`/
 * `text` empty (the user's own reply text, typed later) and seed
 * `quotedHtml`/`quotedText` with the quoted source message via
 * `buildReplyDraftQuote`.
 * `reply`/`forward` 409 (`ActiveDraftConflictError`) when the thread already
 * has a non-terminal draft instead of opening a second one.
 */
export async function createEmailDraftForUser({
  userId,
  kind,
  threadId,
  replyToMessageId,
}: {
  userId: string;
  kind: EmailDraftKind;
  threadId?: string;
  replyToMessageId?: string;
}): Promise<EmailDraft> {
  const account = await loadEmailAccount({ userId });

  if (kind === 'new') {
    if (threadId || replyToMessageId) {
      throw new BadRequestException('A new-mail draft must not reference a thread or message');
    }

    return insertEmailDraft({
      accountId: account.id,
      origin: 'user',
      kind,
      threadId: null,
      replyToMessageId: null,
      to: [],
      cc: [],
      bcc: [],
      subject: null,
      content: '',
      text: '',
      attachments: [],
      status: 'ready',
    });
  }

  if (!threadId || !replyToMessageId) {
    throw new BadRequestException(`A ${kind} draft requires both threadId and replyToMessageId`);
  }

  const thread = await requireOwnedThread({ accountId: account.id, threadId });
  const message = await requireOwnedMessage({ accountId: account.id, messageId: replyToMessageId });

  if (message.threadId !== thread.id) {
    throw new BadRequestException('replyToMessageId does not belong to threadId');
  }

  await assertNoActiveDraftOnThread({ accountId: account.id, threadId: thread.id });

  const provider = await getMailProviderForUser({ userId });
  const { quotedHtml, quotedText } = await buildReplyDraftQuote({ provider, message });
  const attachments =
    kind === 'forward' ? await resolveForwardAttachments({ provider, message }) : [];

  return insertEmailDraft({
    accountId: account.id,
    origin: 'user',
    kind,
    threadId: thread.id,
    replyToMessageId: message.id,
    to: kind === 'reply' ? [message.from] : [],
    cc: [],
    bcc: [],
    subject: thread.subject,
    content: '',
    text: '',
    quotedHtml,
    quotedText,
    attachments,
    status: 'ready',
  });
}

/**
 * [GET] /email/draft?threadId=...
 * `threadId` present -> that thread's drafts; absent -> every non-terminal
 * draft on the account, the Drafts folder.
 */
export async function listEmailDraftsForUser({
  userId,
  threadId,
}: {
  userId: string;
  threadId?: string;
}): Promise<EmailDraft[]> {
  const account = await loadEmailAccount({ userId });

  if (threadId) {
    await requireOwnedThread({ accountId: account.id, threadId });

    const { error, data: drafts } = await tryCatch(() =>
      listEmailDraftsByThreadId({ accountId: account.id, threadId }),
    );

    if (error !== null || !drafts) {
      logger.error('Failed to list thread drafts', error);
      throw new InternalServerErrorException('Failed to list drafts');
    }

    return drafts;
  }

  const { error, data: drafts } = await tryCatch(() =>
    listEmailDraftsByAccountId({ accountId: account.id }),
  );

  if (error !== null || !drafts) {
    logger.error('Failed to list account drafts', error);
    throw new InternalServerErrorException('Failed to list drafts');
  }

  return drafts;
}

/**
 * [GET] /email/draft/:draftId
 * A single draft by id, e.g. for the panel to re-fetch its own draft
 * directly instead of filtering the account-wide list client-side.
 */
export async function getEmailDraftForUser({
  userId,
  draftId,
}: {
  userId: string;
  draftId: string;
}): Promise<EmailDraft> {
  const account = await loadEmailAccount({ userId });
  return requireOwnedDraft({ accountId: account.id, draftId });
}

// Both in-flight and review-ready drafts, across every thread on the
// account: this is the account-wide "review inbox", not
// just a status poll for jobs still running.
const REVIEWABLE_DRAFT_STATUSES: EmailDraftStatus[] = ['generating', 'ready'];

/**
 * [GET] /email/draft/pending
 */
export async function listPendingEmailDraftsForUser({
  userId,
}: {
  userId: string;
}): Promise<EmailDraft[]> {
  const account = await loadEmailAccount({ userId });

  const { error, data: drafts } = await tryCatch(() =>
    listPendingEmailDraftsByAccountId({
      accountId: account.id,
      statuses: REVIEWABLE_DRAFT_STATUSES,
    }),
  );

  if (error !== null || !drafts) {
    logger.error('Failed to list pending drafts', error);
    throw new InternalServerErrorException('Failed to list drafts');
  }

  return drafts;
}

async function requireOwnedDraft({
  accountId,
  draftId,
}: {
  accountId: string;
  draftId: string;
}): Promise<EmailDraft> {
  const { error, data: draft } = await tryCatch(() =>
    getEmailDraftById({ id: draftId, accountId }),
  );

  if (error !== null) {
    logger.error('Failed to load email draft', error);
    throw new InternalServerErrorException('Failed to load draft');
  }

  if (!draft) {
    throw new NotFoundException('Draft not found');
  }

  return draft;
}

function toMailAddressFromParticipant(participant: EmailParticipant): MailAddress {
  return { name: participant.name ?? undefined, address: participant.email };
}

// Null providerMessageId means the attachment lives on the draft itself, not a forwarded message.
function fetchDraftAttachmentContent({
  provider,
  providerDraftId,
  attachment,
}: {
  provider: MailProvider;
  providerDraftId: string | null;
  attachment: EmailDraftAttachment;
}): Promise<MailAttachmentContent> {
  if (attachment.providerMessageId) {
    return provider.getAttachment(attachment.providerMessageId, attachment.providerAttachmentId);
  }

  if (!providerDraftId) {
    return Promise.reject(
      new Error(
        'Draft attachment has no source message and the draft has not reached the provider',
      ),
    );
  }

  return provider.getDraftAttachment(providerDraftId, attachment.providerAttachmentId);
}

async function resolveDraftAttachmentContent({
  provider,
  providerDraftId,
  attachment,
}: {
  provider: MailProvider;
  providerDraftId: string | null;
  attachment: EmailDraftAttachment;
}): Promise<MailAttachmentInput> {
  const { error, data: content } = await tryCatch(() =>
    fetchDraftAttachmentContent({ provider, providerDraftId, attachment }),
  );

  if (error !== null || !content) {
    logger.error(`Failed to fetch draft attachment ${attachment.providerAttachmentId}`, error);
    throw new InternalServerErrorException('Failed to load a forwarded attachment');
  }

  return {
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    content: content.data,
    ...(attachment.contentId ? { contentId: attachment.contentId } : {}),
  };
}

// Nothing is stored on our side; bytes are re-fetched from the provider at write-back/send time.
function resolveDraftAttachmentContents({
  provider,
  draft,
}: {
  provider: MailProvider;
  draft: EmailDraft;
}): Promise<MailAttachmentInput[]> {
  return Promise.all(
    draft.attachments.map((attachment) =>
      resolveDraftAttachmentContent({
        provider,
        providerDraftId: draft.providerDraftId,
        attachment,
      }),
    ),
  );
}

async function buildDraftSendMailInput({
  provider,
  account,
  draft,
}: {
  provider: MailProvider;
  account: EmailAccount;
  draft: EmailDraft;
}): Promise<SendMailInput> {
  // Every push for a reply/forward draft re-supplies threading, dropping it
  // on one save detaches the draft from its thread. Falls back to
  // untreaded once replyToMessageId turns null (source message purged),
  // same fallback sendEmailDraftForUser already used for the final send.
  const thread =
    draft.threadId && draft.replyToMessageId
      ? await resolveThreading({
          provider,
          account,
          threadId: draft.threadId,
          replyToMessageId: draft.replyToMessageId,
        })
      : undefined;

  const attachments = await resolveDraftAttachmentContents({ provider, draft });
  assertAttachmentsWithinBudget(attachments);

  // `content`/`text` are the user's own typed reply; `quotedHtml`/
  // `quotedText` are the read-only quoted history rendered separately in the
  // compose UI. The two are
  // rejoined here, at the edge, into the single `html`/`text` MIME parts the
  // provider actually sends - `joinDraftContentWithQuote` is the one shared
  // implementation of that join, also used by apps/worker's write-back.
  const { html, text } = joinDraftContentWithQuote({
    content: draft.content,
    text: draft.text,
    quotedHtml: draft.quotedHtml,
    quotedText: draft.quotedText,
  });

  return {
    to: draft.to.map(toMailAddressFromParticipant),
    cc: draft.cc.length > 0 ? draft.cc.map(toMailAddressFromParticipant) : undefined,
    bcc: draft.bcc.length > 0 ? draft.bcc.map(toMailAddressFromParticipant) : undefined,
    subject: draft.subject ?? '',
    html,
    text,
    attachments: attachments.length > 0 ? attachments : undefined,
    thread,
  };
}

// An abandoned compose click must not leave anything in the user's real mailbox.
function isDraftEmpty(draft: EmailDraft): boolean {
  return (
    draft.to.length === 0 &&
    draft.cc.length === 0 &&
    draft.bcc.length === 0 &&
    draft.content.trim().length === 0
  );
}

// Best-effort: a transient provider failure is logged, not thrown, so the already-succeeded autosave doesn't fail.
async function pushDraftToProvider({
  userId,
  account,
  draft,
}: {
  userId: string;
  account: EmailAccount;
  draft: EmailDraft;
}): Promise<EmailDraft> {
  const provider = await getMailProviderForUser({ userId });
  const sendInput = await buildDraftSendMailInput({ provider, account, draft });

  const { error, data: pushed } = await tryCatch(() =>
    draft.providerDraftId
      ? provider.updateDraft(draft.providerDraftId, sendInput)
      : provider.createDraft(sendInput),
  );

  if (error !== null || !pushed) {
    logger.error(`Failed to push draft ${draft.id} to the mail provider`, error);
    return draft;
  }

  if (pushed.id === draft.providerDraftId) {
    return draft;
  }

  const { data: withProviderId } = await tryCatch(() =>
    updateEmailDraft({ id: draft.id, accountId: account.id, providerDraftId: pushed.id }),
  );

  return withProviderId ?? draft;
}

// An attachment-free draft writes back on every call; once it carries attachments, only `flush` (explicit) triggers one.
async function pushDraftToProviderIfDue({
  userId,
  account,
  draft,
  flush,
}: {
  userId: string;
  account: EmailAccount;
  draft: EmailDraft;
  flush: boolean;
}): Promise<EmailDraft> {
  const dueForPush = draft.attachments.length === 0 || flush;

  if (!dueForPush || isDraftEmpty(draft)) {
    return draft;
  }

  return pushDraftToProvider({ userId, account, draft });
}

// [PATCH] /email/draft/:draftId, the autosave endpoint. `flush` is control-only, never persisted on the row.
export async function updateEmailDraftForUser({
  userId,
  draftId,
  to,
  cc,
  bcc,
  subject,
  content,
  text,
  attachments,
  flush,
}: {
  userId: string;
  draftId: string;
  to?: EmailParticipant[];
  cc?: EmailParticipant[];
  bcc?: EmailParticipant[];
  subject?: string | null;
  content?: string;
  text?: string;
  attachments?: EmailDraftAttachment[];
  flush?: boolean;
}): Promise<EmailDraft> {
  const account = await loadEmailAccount({ userId });
  const existing = await requireOwnedDraft({ accountId: account.id, draftId });

  if (TERMINAL_DRAFT_STATUSES.has(existing.status)) {
    throw new BadRequestException(`Draft is already ${existing.status}`);
  }

  const { error, data: updated } = await tryCatch(() =>
    updateEmailDraft({
      id: draftId,
      accountId: account.id,
      ...(to !== undefined ? { to } : {}),
      ...(cc !== undefined ? { cc } : {}),
      ...(bcc !== undefined ? { bcc } : {}),
      ...(subject !== undefined ? { subject } : {}),
      ...(content !== undefined ? { content } : {}),
      ...(text !== undefined ? { text } : {}),
      ...(attachments !== undefined ? { attachments } : {}),
    }),
  );

  if (error !== null || !updated) {
    logger.error('Failed to update draft', error);
    throw new InternalServerErrorException('Failed to update draft');
  }

  return pushDraftToProviderIfDue({ userId, account, draft: updated, flush: flush === true });
}

// A 404 (already gone - sent or discarded elsewhere) counts as success.
async function deleteProviderDraftTolerating404({
  userId,
  providerDraftId,
  draftId,
}: {
  userId: string;
  providerDraftId: string;
  draftId: string;
}): Promise<void> {
  const provider = await getMailProviderForUser({ userId });
  const { error } = await tryCatch(() => provider.deleteDraft(providerDraftId));

  if (error !== null && !isMailNotFoundError(error)) {
    logger.error(`Failed to delete provider draft for local draft ${draftId}`, error);
    throw new InternalServerErrorException('Failed to discard draft');
  }
}

/**
 * [POST] /email/draft/:draftId/discard
 */
export async function discardEmailDraftForUser({
  userId,
  draftId,
}: {
  userId: string;
  draftId: string;
}): Promise<EmailDraft> {
  const account = await loadEmailAccount({ userId });
  const draft = await requireOwnedDraft({ accountId: account.id, draftId });

  if (draft.providerDraftId) {
    await deleteProviderDraftTolerating404({
      userId,
      providerDraftId: draft.providerDraftId,
      draftId: draft.id,
    });
  }

  const { error, data: updated } = await tryCatch(() =>
    updateEmailDraft({
      id: draftId,
      accountId: account.id,
      status: 'discarded',
      ...(draft.providerDraftId ? { providerDraftId: null } : {}),
    }),
  );

  if (error !== null || !updated) {
    logger.error('Failed to discard draft', error);
    throw new InternalServerErrorException('Failed to discard draft');
  }

  return updated;
}

// [POST] /email/draft/:draftId/send. Threads from the draft's own threadId/replyToMessageId, not the request's.
export async function sendEmailDraftForUser({
  userId,
  draftId,
  to,
  cc,
  bcc,
  subject,
  html,
  text,
  content,
  mediaIds,
  files,
}: {
  userId: string;
  draftId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  /** Final edited markdown, if the user changed the draft in the editor before sending. */
  content?: string;
  mediaIds?: string[];
  files?: File[];
}): Promise<SendEmailResponse> {
  const account = await loadEmailAccount({ userId });
  const draft = await requireOwnedDraft({ accountId: account.id, draftId });

  if (TERMINAL_DRAFT_STATUSES.has(draft.status)) {
    throw new BadRequestException(`Draft is already ${draft.status}`);
  }

  const provider = await getMailProviderForUser({ userId });
  const extraAttachments = await resolveDraftAttachmentContents({ provider, draft });

  return sendEmailForUser({
    userId,
    to,
    cc,
    bcc,
    subject,
    html,
    text,
    mediaIds,
    files,
    extraAttachments,
    draftId: draft.id,
    draftContent: content,
    providerDraftId: draft.providerDraftId ?? undefined,
    // replyToMessageId turns null once its source message is purged
    // (email.schema.ts); when that happens the draft survives but can no
    // longer be sent as a threaded reply, so it falls back to a new thread.
    // `new`-kind drafts have a null threadId too, same fallback applies.
    threadId: draft.threadId && draft.replyToMessageId ? draft.threadId : undefined,
    replyToMessageId: draft.replyToMessageId ?? undefined,
  });
}

/**
 * [POST] /email/draft/trigger
 * Manual "Draft with AI": enqueues the same job the auto-draft path uses,
 * with an optional agent override. The worker owns creating/updating the
 * `email_drafts` row; this endpoint only acknowledges the request.
 */
export async function triggerEmailDraftForUser({
  userId,
  threadId,
  replyToMessageId,
  agentId,
}: {
  userId: string;
  threadId: string;
  replyToMessageId: string;
  agentId?: string;
}): Promise<void> {
  const account = await loadEmailAccount({ userId });
  const thread = await requireOwnedThread({ accountId: account.id, threadId });
  const message = await requireOwnedMessage({ accountId: account.id, messageId: replyToMessageId });

  if (message.threadId !== thread.id) {
    throw new BadRequestException('replyToMessageId does not belong to threadId');
  }

  if (agentId) {
    await assertPrivateWorkspaceAgent({ userId, agentId });
  }

  const { error } = await tryCatch(() =>
    queue.emailDraft().add(
      EMAIL_DRAFT_JOB,
      emailDraftJobSchema.parse({
        accountId: account.id,
        threadId: thread.id,
        replyToMessageId: message.id,
        agentId,
      }),
    ),
  );

  if (error !== null) {
    logger.error('Failed to enqueue manual draft trigger', error);
    throw new InternalServerErrorException('Failed to start drafting a reply');
  }
}

// --- Attachments --------------------------------------------------------

/**
 * [GET] /email/message/:messageId/attachments
 * Attachment metadata is never persisted,
 * so the list itself - not just the download - is
 * resolved live.
 */
export async function listEmailMessageAttachmentsForUser({
  userId,
  messageId,
}: {
  userId: string;
  messageId: string;
}): Promise<MailAttachmentMeta[]> {
  const account = await loadEmailAccount({ userId });
  const message = await requireOwnedMessage({ accountId: account.id, messageId });
  const provider = await getMailProviderForUser({ userId });

  const { error, data: fullMessage } = await tryCatch(() =>
    provider.fetchMessage(message.providerMessageId, 'full'),
  );

  if (error !== null || !fullMessage) {
    logger.error(`Failed to load attachments for message ${messageId}`, error);
    throw new InternalServerErrorException('Failed to load message attachments');
  }

  return fullMessage.body.attachments;
}

export interface EmailAttachmentDownload {
  filename: string;
  mimeType: string;
  data: Buffer;
}

// Keyed on `partId` (stable), not the provider's `attachmentId` (not guaranteed stable across message changes).
export async function downloadEmailAttachmentForUser({
  userId,
  messageId,
  partId,
}: {
  userId: string;
  messageId: string;
  partId: string;
}): Promise<EmailAttachmentDownload> {
  const account = await loadEmailAccount({ userId });
  const message = await requireOwnedMessage({ accountId: account.id, messageId });
  const provider = await getMailProviderForUser({ userId });

  const { error: fetchError, data: fullMessage } = await tryCatch(() =>
    provider.fetchMessage(message.providerMessageId, 'full'),
  );

  if (fetchError !== null || !fullMessage) {
    logger.error(`Failed to load message ${messageId} for attachment download`, fetchError);
    throw new InternalServerErrorException('Failed to load message');
  }

  const meta = fullMessage.body.attachments.find((attachment) => attachment.partId === partId);

  if (!meta) {
    throw new NotFoundException('Attachment not found');
  }

  const { error, data: content } = await tryCatch(() =>
    provider.getAttachment(message.providerMessageId, meta.attachmentId),
  );

  if (error !== null || !content) {
    logger.error(`Failed to download attachment ${partId}`, error);
    throw new InternalServerErrorException('Failed to download attachment');
  }

  return { filename: meta.filename, mimeType: meta.mimeType, data: content.data };
}
