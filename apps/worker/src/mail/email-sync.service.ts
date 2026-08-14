// apps/worker/src/mail/email-sync.service.ts
//
// Core email-sync algorithm (docs/email/prd.md, "Sync model" + "Worker
// jobs"), called once per connected account by the email-sync processor.
// Kept out of the processor file so the processor stays a thin BullMQ
// wrapper, matching the rest of apps/worker (gen-video/gen-images delegate
// to @repo/ai's run* functions the same way; email has no package of its
// own to hold this, so it lives here instead).

import type { EmailAccount } from '@repo/database';
import {
  deleteEmailMessageByProviderMessageId,
  deleteEmailThreadIfEmpty,
  findEmailMessagesByProviderIds,
  getEmailAccountById,
  updateEmailAccountSyncState,
  updateEmailMessageFlags,
  upsertEmailMessageByProviderMessageId,
  upsertEmailThreadByProviderThreadId,
} from '@repo/database';
import { logger } from '@repo/logger';
import type {
  MailMessageMetadata,
  MailProvider,
  MailSyncChange,
  MailSyncFlagsChanged,
  MailSyncMessageAdded,
  MailSyncMessageDeleted,
} from '@repo/mail/provider';
import { EMAIL_CLASSIFY_JOB, EmailClassifyJobDto, queue } from '@repo/queue';
import { getGmailProviderForAccount } from './gmail-provider';
import { persistMessageBody } from './message-body';
import { fromParticipant, summarizeThread, toParticipants } from './participants';

// "the most recent ~50 inbox threads" (docs/email/prd.md, "Sync model").
const SEED_THREAD_COUNT = 50;

export async function syncEmailAccount(accountId: string): Promise<void> {
  const account = await getEmailAccountById({ id: accountId });
  if (!account) {
    logger.warn(`Email account ${accountId} not found, skipping sync`);
    return;
  }

  await updateEmailAccountSyncState({ id: accountId, syncState: 'syncing' });

  try {
    const provider = getGmailProviderForAccount(account);

    if (account.syncCursor) {
      await applyIncrementalSync({ account, provider, cursor: account.syncCursor });
    } else {
      await seedInitialSync({ account, provider });
    }

    await updateEmailAccountSyncState({ id: accountId, syncState: 'idle', lastSyncedAt: new Date() });
  } catch (error) {
    await updateEmailAccountSyncState({ id: accountId, syncState: 'error' });
    throw error; // rethrow so BullMQ retries the job.
  }
}

// Cursor first, so nothing that lands between the search below and this
// call is missed (docs/email/prd.md, "Sync model"). Also the cursor-expiry
// fallback: cursorExpired re-runs this exact path, and the upserts below
// dedupe on (accountId, providerThreadId)/(accountId, providerMessageId),
// so re-importing overlapping mail is idempotent.
async function seedInitialSync({
  account,
  provider,
}: {
  account: EmailAccount;
  provider: MailProvider;
}): Promise<void> {
  const profile = await provider.getProfile();

  const threadIds = await collectInboxThreadIds(provider, SEED_THREAD_COUNT);
  for (const threadId of threadIds) {
    await importThread({ account, provider, providerThreadId: threadId });
  }

  await updateEmailAccountSyncState({ id: account.id, syncCursor: profile.cursor });
}

async function collectInboxThreadIds(provider: MailProvider, limit: number): Promise<string[]> {
  const threadIds: string[] = [];
  let pageToken: string | null | undefined;

  do {
    const page = await provider.search('in:inbox', pageToken);
    threadIds.push(...page.threadIds);
    pageToken = page.nextPageToken;
  } while (pageToken && threadIds.length < limit);

  return threadIds.slice(0, limit);
}

// Seed import only: pulls the full thread (metadata + bodies, since
// fetchThread returns both) and upserts everything. Never enqueues
// classification — this is pre-connect mail, not new mail (docs/email/prd.md,
// "Worker jobs").
async function importThread({
  account,
  provider,
  providerThreadId,
}: {
  account: EmailAccount;
  provider: MailProvider;
  providerThreadId: string;
}): Promise<void> {
  const thread = await provider.fetchThread(providerThreadId);
  if (thread.messages.length === 0) {
    return;
  }

  const summary = summarizeThread(thread.messages);
  const threadRow = await upsertEmailThreadByProviderThreadId({
    accountId: account.id,
    providerThreadId: thread.id,
    subject: summary.subject,
    snippet: summary.snippet,
    lastMessageAt: summary.lastMessageAt,
    participants: summary.participants,
  });

  for (const message of thread.messages) {
    const messageRow = await upsertEmailMessageByProviderMessageId({
      accountId: account.id,
      threadId: threadRow.id,
      providerMessageId: message.id,
      from: fromParticipant(message.from),
      to: toParticipants(message.to),
      cc: toParticipants(message.cc),
      subject: message.subject,
      snippet: message.snippet,
      sentAt: message.date,
      isUnread: message.unread,
      isStarred: message.starred,
      labelIds: message.labelIds,
    });

    await persistMessageBody({ messageId: messageRow.id, body: message.body });
  }
}

async function applyIncrementalSync({
  account,
  provider,
  cursor,
}: {
  account: EmailAccount;
  provider: MailProvider;
  cursor: string;
}): Promise<void> {
  const outcome = await provider.syncFromCursor(cursor);

  if (outcome.status === 'cursorExpired') {
    logger.warn(
      `Sync cursor expired for email account ${account.id}, falling back to a full resync`,
    );
    await seedInitialSync({ account, provider });
    return;
  }

  await applySyncChanges({ account, changes: outcome.changes });
  await updateEmailAccountSyncState({ id: account.id, syncCursor: outcome.nextCursor });
}

function isAdded(change: MailSyncChange): change is MailSyncMessageAdded {
  return change.type === 'added';
}

function isFlagsChanged(change: MailSyncChange): change is MailSyncFlagsChanged {
  return change.type === 'flagsChanged';
}

function isDeleted(change: MailSyncChange): change is MailSyncMessageDeleted {
  return change.type === 'deleted';
}

async function applySyncChanges({
  account,
  changes,
}: {
  account: EmailAccount;
  changes: MailSyncChange[];
}): Promise<void> {
  const addedChanges = changes.filter(isAdded);
  const flagsChanges = changes.filter(isFlagsChanged);
  const deletedChanges = changes.filter(isDeleted);

  for (const change of addedChanges) {
    await importAddedMessage({ account, message: change.message });
  }

  await applyFlagsChanges({ accountId: account.id, changes: flagsChanges });

  for (const change of deletedChanges) {
    // Returns the deleted row (or null if it was already gone) so its
    // threadId is right there for the empty-thread cleanup below;
    // deleteEmailThreadIfEmpty no-ops on its own if the thread isn't
    // actually empty, so this is safe to call unconditionally.
    const deleted = await deleteEmailMessageByProviderMessageId({
      accountId: account.id,
      providerMessageId: change.messageId,
    });
    if (deleted) {
      await deleteEmailThreadIfEmpty({ id: deleted.threadId });
    }
  }
}

// updateEmailMessageFlags is keyed by our internal row id, but flagsChanged
// events arrive keyed by the provider's message id, so every id in this
// batch is resolved to a local row in one round trip first.
async function applyFlagsChanges({
  accountId,
  changes,
}: {
  accountId: string;
  changes: MailSyncFlagsChanged[];
}): Promise<void> {
  if (changes.length === 0) {
    return;
  }

  const existing = await findEmailMessagesByProviderIds({
    accountId,
    providerMessageIds: changes.map((change) => change.messageId),
  });
  const existingByProviderId = new Map(existing.map((message) => [message.providerMessageId, message]));

  for (const change of changes) {
    const message = existingByProviderId.get(change.messageId);
    if (!message) {
      // A flag change for a message we never indexed (e.g. pre-connect
      // mail outside the seed window). Nothing local to update.
      continue;
    }
    await updateEmailMessageFlags({
      id: message.id,
      isUnread: change.unread,
      isStarred: change.starred,
      labelIds: change.labelIds,
    });
  }
}

// A single new message: upsert its thread (denormalized fields refreshed
// from this message, see participants.ts) and its own row, then enqueue
// classification — unlike the seed path, this is new mail arriving after
// connect (docs/email/prd.md, "Worker jobs").
async function importAddedMessage({
  account,
  message,
}: {
  account: EmailAccount;
  message: MailMessageMetadata;
}): Promise<void> {
  const summary = summarizeThread([message]);
  const threadRow = await upsertEmailThreadByProviderThreadId({
    accountId: account.id,
    providerThreadId: message.threadId,
    subject: summary.subject,
    snippet: summary.snippet,
    lastMessageAt: summary.lastMessageAt,
    participants: summary.participants,
  });

  const messageRow = await upsertEmailMessageByProviderMessageId({
    accountId: account.id,
    threadId: threadRow.id,
    providerMessageId: message.id,
    from: fromParticipant(message.from),
    to: toParticipants(message.to),
    cc: toParticipants(message.cc),
    subject: message.subject,
    snippet: message.snippet,
    sentAt: message.date,
    isUnread: message.unread,
    isStarred: message.starred,
    labelIds: message.labelIds,
  });

  await queue
    .emailClassify()
    .add(
      EMAIL_CLASSIFY_JOB,
      new EmailClassifyJobDto({ accountId: account.id, messageId: messageRow.id }).toJSON(),
    );
}
