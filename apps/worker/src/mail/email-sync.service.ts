// apps/worker/src/mail/email-sync.service.ts
import { config } from '@repo/config';
import type { EmailAccount, EmailDraft, NewEmailMessageBody } from '@repo/database';
import {
  createEmailDraft,
  deleteEmailDraft,
  deleteEmailMessageByProviderMessageId,
  deleteEmailThreadIfEmpty,
  findEmailMessagesByProviderIds,
  getEmailAccountById,
  getEmailDraftByProviderDraftId,
  getEmailThreadByProviderThreadId,
  listEmailDraftsByAccountId,
  listEmptyStaleEmailDrafts,
  updateEmailAccountSyncState,
  updateEmailDraft,
  updateEmailMessageFlags,
  upsertEmailMessageBodies,
  upsertEmailMessageByProviderMessageId,
  upsertEmailMessagesByProviderMessageId,
  upsertEmailThreadByProviderThreadId,
} from '@repo/database';
import { logger } from '@repo/logger';
import { toCanonicalText } from '@repo/mail/content';
import { isMailAuthError } from '@repo/mail/provider';
import type {
  MailDraftSummary,
  MailFolder,
  MailMessageMetadata,
  MailProvider,
  MailSyncChange,
  MailSyncFlagsChanged,
  MailSyncMessageAdded,
  MailSyncMessageDeleted,
} from '@repo/mail/provider';
import { EMAIL_CLASSIFY_JOB, emailClassifyJobSchema, queue } from '@repo/queue';
import { getMailProviderForAccount } from './mail-provider';
import { toPersistedBody } from './message-body';
import { fromParticipant, summarizeThread, toParticipants } from './participants';

// "the most recent ~50 inbox threads".
const SEED_THREAD_COUNT = 50;

// Abandoned drafts: still
// empty and untouched this long are swept on the account's own sync tick.
const EMPTY_DRAFT_SWEEP_AGE_MS = 24 * 60 * 60 * 1000;

// The client autosaves locally on a ~1s debounce and write-backs to the
// provider on a ~3s one,
// so a sync tick landing mid-edit can observe a local row that's already
// ahead of what the provider has. This grace window absorbs that in-flight
// write-back plus ordinary clock skew: it's what lets reconcileDrafts tell
// "the provider has a genuinely newer edit" apart from "our own recent
// write hasn't reached it yet", without the worker needing any notion of UI
// focus/dirty state (that half of conflict handling stays out of scope
// here; freshness is the worker's whole contribution to it).
const DRAFT_RECONCILE_GRACE_MS = 60 * 1000;

function isDraftMessage(message: Pick<MailMessageMetadata, 'folder'>): boolean {
  return message.folder === 'draft';
}

// Mail that shouldn't reach the classifier: sent is the account owner's own
// outgoing mail (classification/auto-draft is for mail arriving in the
// account, not mail it sent); spam has already been judged by the
// provider's own filter, and classifying it risks auto-drafting a reply to
// a spammer via the auto-draft-sender allowlist or a matching category;
// trash is mail the user already discarded. All three still reach
// email_messages for display.
const NON_CLASSIFIABLE_FOLDERS: MailFolder[] = ['sent', 'spam', 'trash'];

function isNonClassifiableMessage(message: Pick<MailMessageMetadata, 'folder'>): boolean {
  return NON_CLASSIFIABLE_FOLDERS.includes(message.folder);
}

export async function syncEmailAccount(accountId: string): Promise<void> {
  const account = await getEmailAccountById({ id: accountId });
  if (!account) {
    logger.warn(`Email account ${accountId} not found, skipping sync`);
    return;
  }

  await updateEmailAccountSyncState({ id: accountId, syncState: 'syncing' });

  try {
    const provider = getMailProviderForAccount(account);

    if (account.syncCursor) {
      await applyIncrementalSync({ account, provider, cursor: account.syncCursor });
    } else {
      await seedInitialSync({ account, provider });
    }

    // Runs after either sync path (including the cursor-expiry fallback,
    // which re-enters seedInitialSync above): reconciles email_drafts
    // against Gmail's actual drafts.list(), then sweeps rows that never
    // reached Gmail and were abandoned.
    // Piggybacked on this job rather than
    // given a queue of its own; see the module comment on both functions.
    await reconcileDrafts({ account, provider });
    await sweepEmptyDrafts({ accountId: account.id });

    await updateEmailAccountSyncState({
      id: accountId,
      syncState: 'idle',
      lastSyncedAt: new Date(),
    });
  } catch (error) {
    await updateEmailAccountSyncState({
      id: accountId,
      syncState: isMailAuthError(error) ? 'reauth_required' : 'error',
    });
    throw error; // rethrow so BullMQ retries the job.
  }
}

// Cursor first, so nothing that lands between the search below and this
// call is missed. Also the cursor-expiry
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

  const threadIds = await provider.listRecentInboxThreadIds(SEED_THREAD_COUNT);
  for (const threadId of threadIds) {
    await importThread({ account, provider, providerThreadId: threadId });
  }

  await updateEmailAccountSyncState({ id: account.id, syncCursor: profile.cursor });
}

// Seed import only: pulls the full thread (metadata + bodies, since
// fetchThread returns both) and upserts everything. Never enqueues
// classification — this is pre-connect mail, not new mail.
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

  // fetchThread returns every message in the thread, drafts included; a
  // reply/forward draft on an already-indexed thread is reconciled into
  // email_drafts separately (reconcileDrafts), never imported as mail.
  const importedMessages = thread.messages.filter((message) => !isDraftMessage(message));

  const messageRows = await upsertEmailMessagesByProviderMessageId(
    importedMessages.map((message) => ({
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
      folder: message.folder,
      labelIds: message.labelIds,
    })),
  );
  const messageIdByProviderId = new Map(messageRows.map((row) => [row.providerMessageId, row.id]));

  const bodies: NewEmailMessageBody[] = [];
  for (const message of importedMessages) {
    const messageId = messageIdByProviderId.get(message.id);
    if (!messageId) continue;

    bodies.push({ messageId, ...toPersistedBody(message.body) });
  }

  await upsertEmailMessageBodies(bodies);
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
  // A draft's contained message is reconciled into email_drafts separately
  // (reconcileDrafts, called once per sync after applySyncChanges), never
  // imported as mail or classified.
  const addedChanges = changes.filter(isAdded).filter((change) => !isDraftMessage(change.message));
  const flagsChanges = changes.filter(isFlagsChanged);
  const deletedChanges = changes.filter(isDeleted);

  await applyAddedChanges({ account, changes: addedChanges });
  await applyFlagsChanges({ accountId: account.id, changes: flagsChanges });

  // A messagesDeleted here for a draft's message is the ordinary churn of
  // `drafts.update` (Gmail deletes the old contained message and adds a new
  // one on every save), not a real deletion, and needs no special-casing:
  // that message id was never imported above (isDraftMessage skips it), so
  // deleteEmailMessageByProviderMessageId below simply finds no local row
  // and no-ops. What marks a local draft row discarded is it disappearing
  // from drafts.list(), handled by reconcileDrafts instead.
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
  const existingByProviderId = new Map(
    existing.map((message) => [message.providerMessageId, message]),
  );

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
      folder: change.folder,
      labelIds: change.labelIds,
    });
  }
}

// Graph delta can't tell "created" from "updated", so an `added` change may
// name a message we already indexed.
// Every message is upserted either way; only ones not
// already indexed before the upsert get (re-)classified.
async function applyAddedChanges({
  account,
  changes,
}: {
  account: EmailAccount;
  changes: MailSyncMessageAdded[];
}): Promise<void> {
  if (changes.length === 0) {
    return;
  }

  const existing = await findEmailMessagesByProviderIds({
    accountId: account.id,
    providerMessageIds: changes.map((change) => change.message.id),
  });
  const alreadyIndexedIds = new Set(existing.map((message) => message.providerMessageId));

  for (const change of changes) {
    await importAddedMessage({
      account,
      message: change.message,
      shouldClassify: !alreadyIndexedIds.has(change.message.id),
    });
  }
}

// Caps LLM cost when a sync surfaces old mail (initial import, reseed, provider bug, worker outage backlog).
function isRecentEnoughToClassify(
  account: EmailAccount,
  message: Pick<MailMessageMetadata, 'date'>,
): boolean {
  const cutoff = Math.max(
    account.createdAt.getTime(),
    Date.now() - config.emailAutoClassifyMaxMessageAgeMs,
  );
  return message.date.getTime() >= cutoff;
}

// A single new (or re-emitted) message: upsert its thread (denormalized
// fields refreshed from this message, see participants.ts) and its own row,
// then enqueue classification only when it's genuinely new — unlike the
// seed path, this is new mail arriving after connect.
// Sent/spam/trash mail is stored (so it still shows up in
// its thread) but skips classification (see isNonClassifiableMessage).
async function importAddedMessage({
  account,
  message,
  shouldClassify,
}: {
  account: EmailAccount;
  message: MailMessageMetadata;
  shouldClassify: boolean;
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
    folder: message.folder,
    labelIds: message.labelIds,
  });

  if (
    !shouldClassify ||
    isNonClassifiableMessage(message) ||
    !isRecentEnoughToClassify(account, message)
  ) {
    return;
  }

  await queue
    .emailClassify()
    .add(
      EMAIL_CLASSIFY_JOB,
      emailClassifyJobSchema.parse({ accountId: account.id, messageId: messageRow.id }),
    );
}

// Reconciles email_drafts against Gmail's own drafts.list(). Diffing the full list, rather than
// correlating individual DRAFT-labelled history events to a specific draft,
// sidesteps a real gap: MailDraftSummary deliberately hides the draft's
// contained message id from callers outside @repo/mail (mail-provider.ts),
// so a messagesAdded/messagesDeleted pair for a draft can't be resolved back
// to a draft id from here anyway. This also gives "disappeared from
// drafts.list()" for free as the discard signal, instead of tracking it
// separately.
async function reconcileDrafts({
  account,
  provider,
}: {
  account: EmailAccount;
  provider: MailProvider;
}): Promise<void> {
  // Captured before listDrafts() so discardVanishedDrafts below compares
  // against a stable point: a draft the client just pushed to Gmail can
  // persist providerDraftId locally without making it into a snapshot taken
  // around the same moment (see DRAFT_RECONCILE_GRACE_MS).
  const tickStartedAt = new Date();
  const draftSummaries = await provider.listDrafts();

  for (const summary of draftSummaries) {
    await upsertReconciledDraft({ account, provider, summary });
  }

  await discardVanishedDrafts({
    account,
    tickStartedAt,
    stillPresentProviderDraftIds: new Set(draftSummaries.map((summary) => summary.id)),
  });
}

async function upsertReconciledDraft({
  account,
  provider,
  summary,
}: {
  account: EmailAccount;
  provider: MailProvider;
  summary: MailDraftSummary;
}): Promise<void> {
  const existing = await getEmailDraftByProviderDraftId({
    providerDraftId: summary.id,
    accountId: account.id,
  });

  // A draft we already marked sent/discarded locally (e.g. our own
  // sendDraft/deleteDraft call just landed) can still show up in one more
  // drafts.list() page while Gmail catches up; leave the terminal row alone
  // rather than resurrecting it.
  if (existing && (existing.status === 'sent' || existing.status === 'discarded')) {
    return;
  }

  if (existing) {
    await refreshReconciledDraft({ account, provider, existing, summary });
    return;
  }

  await createReconciledDraft({ account, provider, summary });
}

// Refreshes a known draft's content from Gmail only when Gmail is genuinely
// ahead of our own last write. summary.date is the contained message's own
// date, which Gmail bumps on every edit (create/update both replace the
// message wholesale), so comparing it against the local row's updatedAt
// tells a real Gmail-side edit (web/mobile, after our last save) apart from
// this account's own write-back still landing. Skips the getDraft fetch
// entirely when nothing looks newer.
async function refreshReconciledDraft({
  account,
  provider,
  existing,
  summary,
}: {
  account: EmailAccount;
  provider: MailProvider;
  existing: EmailDraft;
  summary: MailDraftSummary;
}): Promise<void> {
  const isGmailNewer =
    summary.date.getTime() > existing.updatedAt.getTime() + DRAFT_RECONCILE_GRACE_MS;
  if (!isGmailNewer) {
    return;
  }

  const full = await provider.getDraft(summary.id);
  const content = toCanonicalText(full.body) ?? '';

  // origin/kind/threadId/replyToMessageId/agentId are set once at creation
  // and rejected by the API's own PATCH;
  // reconciling an already-known draft only refreshes what
  // a Gmail-side edit can change.
  await updateEmailDraft({
    id: existing.id,
    accountId: account.id,
    to: toParticipants(full.to),
    cc: toParticipants(full.cc),
    bcc: toParticipants(full.bcc),
    subject: full.subject,
    content,
  });
}

async function createReconciledDraft({
  account,
  provider,
  summary,
}: {
  account: EmailAccount;
  provider: MailProvider;
  summary: MailDraftSummary;
}): Promise<void> {
  const full = await provider.getDraft(summary.id);
  const content = toCanonicalText(full.body) ?? '';

  // Gmail assigns every draft a threadId, including a brand-new standalone
  // draft, and that id doesn't necessarily correspond to a real conversation
  // we've indexed. Only attach the draft to a thread we already have; a
  // draft on an unknown thread is stored thread-less rather than creating a
  // phantom email_threads row.
  const thread = await getEmailThreadByProviderThreadId({
    accountId: account.id,
    providerThreadId: full.threadId,
  });

  await createEmailDraft({
    accountId: account.id,
    origin: 'user',
    // Gmail's draft resource doesn't say reply vs. forward; a draft on a
    // thread we've indexed is treated as a reply, the more common case
    // (undetectable from the data the provider exposes).
    kind: thread ? 'reply' : 'new',
    threadId: thread?.id ?? null,
    replyToMessageId: null,
    agentId: null,
    to: toParticipants(full.to),
    cc: toParticipants(full.cc),
    bcc: toParticipants(full.bcc),
    subject: full.subject,
    content,
    status: 'ready',
    providerDraftId: summary.id,
  });
}

async function discardVanishedDrafts({
  account,
  tickStartedAt,
  stillPresentProviderDraftIds,
}: {
  account: EmailAccount;
  tickStartedAt: Date;
  stillPresentProviderDraftIds: Set<string>;
}): Promise<void> {
  // listEmailDraftsByAccountId defaults to non-terminal statuses, so this
  // never touches a draft that's already 'sent' or 'discarded'.
  const nonTerminalDrafts = await listEmailDraftsByAccountId({ accountId: account.id });

  for (const draft of nonTerminalDrafts) {
    if (!draft.providerDraftId || stillPresentProviderDraftIds.has(draft.providerDraftId)) {
      continue;
    }

    // A push landing around the same time as this tick's listDrafts()
    // snapshot (captured at tickStartedAt) can persist providerDraftId
    // locally without making it into that snapshot. A row touched this
    // recently is not evidence the Gmail draft is actually gone, so it's
    // left for the next tick to judge instead of discarded here.
    const touchedRecently =
      draft.updatedAt.getTime() > tickStartedAt.getTime() - DRAFT_RECONCILE_GRACE_MS;
    if (touchedRecently) {
      continue;
    }

    await updateEmailDraft({ id: draft.id, accountId: account.id, status: 'discarded' });
  }
}

// Rows that never reached Gmail (providerDraftId still null) and were left
// empty and untouched past the cutoff are a plain local delete, no Gmail
// call involved.
async function sweepEmptyDrafts({ accountId }: { accountId: string }): Promise<void> {
  const staleDrafts = await listEmptyStaleEmailDrafts({
    accountId,
    olderThan: new Date(Date.now() - EMPTY_DRAFT_SWEEP_AGE_MS),
  });

  for (const draft of staleDrafts) {
    await deleteEmailDraft({ id: draft.id, accountId });
  }
}
