import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { agent } from './agent.schema';
import { primaryIdColumn, timestamps } from './common.schema';
import { user } from './user.schema';

export type EmailProvider = 'gmail' | 'microsoft';

// Duplicated from @repo/mail's MailFolder to avoid a dependency on it.
export type EmailMessageFolder = 'inbox' | 'sent' | 'archive' | 'trash' | 'spam' | 'draft';

// Distinct from 'error': credentials were rejected outright, not a transient failure.
export type EmailAccountSyncState = 'idle' | 'syncing' | 'error' | 'reauth_required';

// Shared shape for from/to/cc columns: Gmail (and any future provider)
// always carries a display name alongside the address.
export interface EmailParticipant {
  name: string | null;
  email: string;
}

export type EmailDraftStatus = 'generating' | 'ready' | 'discarded' | 'sent';

// Who authored the draft: drives the sparkle badge and the review-queue
// count only, nothing else (docs/email/drafts-change-request.md, "Decisions").
export type EmailDraftOrigin = 'ai' | 'user';

// What the draft is composing. `new` rows have no thread yet, hence
// `email_drafts.threadId` being nullable (docs/email/drafts-change-request.md,
// "Scope > 1").
export type EmailDraftKind = 'new' | 'reply' | 'forward';

// Metadata only; attachment bytes are re-fetched from the provider on demand.
export interface EmailDraftAttachment {
  // Null when copied from the draft's own contained message instead of a forwarded one; see getDraftAttachment.
  providerMessageId: string | null;
  providerAttachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId: string | null;
  inline: boolean;
}

// EMAIL ACCOUNT
// One row per user (docs/email/prd.md, "Auth and account connection"). The
// actual OAuth tokens live in better-auth's `account` table via
// linkSocial(); this row only tracks the mailbox connection and sync state.
export const emailAccount = pgTable(
  'email_accounts',
  {
    id: primaryIdColumn,
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().$type<EmailProvider>(),
    email: text('email').notNull(),
    // Opaque cursor: Gmail's historyId today, a Graph delta token later.
    // Null until the first successful sync.
    syncCursor: text('sync_cursor'),
    // Used for auto-draft and as the default for the manual "Draft with AI"
    // button, overridable per manual trigger. Null until the user picks one
    // in email settings.
    defaultAgentId: text('default_agent_id').references(() => agent.id, {
      onDelete: 'set null',
    }),
    syncState: text('sync_state').notNull().$type<EmailAccountSyncState>().default('idle'),
    lastSyncedAt: timestamp('last_synced_at'),
    ...timestamps,
  },
  (table) => [index('emailAccount_defaultAgentId_idx').on(table.defaultAgentId)],
);

export type EmailAccount = typeof emailAccount.$inferSelect;
export type NewEmailAccount = typeof emailAccount.$inferInsert;

// EMAIL CATEGORY
// Per-account, user-configurable classification bucket (docs/email/prd.md,
// "Auto-categorize"). `description` is fed to the classifier prompt as-is,
// so it stays natural language rather than a machine-readable rule.
export const emailCategory = pgTable(
  'email_categories',
  {
    id: primaryIdColumn,
    accountId: text('account_id')
      .notNull()
      .references(() => emailAccount.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    color: text('color').notNull(),
    autoDraft: boolean('auto_draft').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index('emailCategory_accountId_idx').on(table.accountId),
    uniqueIndex('emailCategory_accountId_name_idx').on(table.accountId, table.name),
  ],
);

export type EmailCategory = typeof emailCategory.$inferSelect;
export type NewEmailCategory = typeof emailCategory.$inferInsert;

// EMAIL AUTO DRAFT SENDER
// Per-account sender allowlist that always triggers auto-draft, independent
// of category (docs/email/prd.md, "Auto-draft replies").
export const emailAutoDraftSender = pgTable(
  'email_auto_draft_senders',
  {
    id: primaryIdColumn,
    accountId: text('account_id')
      .notNull()
      .references(() => emailAccount.id, { onDelete: 'cascade' }),
    senderEmail: text('sender_email').notNull(),
    ...timestamps,
  },
  (table) => [
    index('emailAutoDraftSender_accountId_idx').on(table.accountId),
    uniqueIndex('emailAutoDraftSender_accountId_senderEmail_idx').on(
      table.accountId,
      table.senderEmail,
    ),
  ],
);

export type EmailAutoDraftSender = typeof emailAutoDraftSender.$inferSelect;
export type NewEmailAutoDraftSender = typeof emailAutoDraftSender.$inferInsert;

// EMAIL THREAD
// Denormalized subject/snippet/participants for the thread-list view so it
// renders without joining every message (docs/email/prd.md, "Sync model").
export const emailThread = pgTable(
  'email_threads',
  {
    id: primaryIdColumn,
    accountId: text('account_id')
      .notNull()
      .references(() => emailAccount.id, { onDelete: 'cascade' }),
    providerThreadId: text('provider_thread_id').notNull(),
    subject: text('subject'),
    snippet: text('snippet'),
    lastMessageAt: timestamp('last_message_at'),
    participants: jsonb('participants').notNull().$type<EmailParticipant[]>().default([]),
    ...timestamps,
  },
  (table) => [
    index('emailThread_accountId_idx').on(table.accountId),
    uniqueIndex('emailThread_accountId_providerThreadId_idx').on(
      table.accountId,
      table.providerThreadId,
    ),
  ],
);

export type EmailThread = typeof emailThread.$inferSelect;
export type NewEmailThread = typeof emailThread.$inferInsert;

// EMAIL MESSAGE
// Body is fetched and persisted lazily; see email_message_bodies.
export const emailMessage = pgTable(
  'email_messages',
  {
    id: primaryIdColumn,
    accountId: text('account_id')
      .notNull()
      .references(() => emailAccount.id, { onDelete: 'cascade' }),
    threadId: text('thread_id')
      .notNull()
      .references(() => emailThread.id, { onDelete: 'cascade' }),
    providerMessageId: text('provider_message_id').notNull(),
    from: jsonb('from').notNull().$type<EmailParticipant>(),
    to: jsonb('to').notNull().$type<EmailParticipant[]>().default([]),
    cc: jsonb('cc').$type<EmailParticipant[]>().default([]),
    subject: text('subject'),
    snippet: text('snippet'),
    sentAt: timestamp('sent_at').notNull(),
    isUnread: boolean('is_unread').notNull().default(true),
    isStarred: boolean('is_starred').notNull().default(false),
    // No backfill: every writer sets this explicitly, the default only satisfies NOT NULL on old rows.
    folder: text('folder').notNull().$type<EmailMessageFolder>().default('inbox'),
    // Gmail label ids, or Outlook category names; read-only.
    labelIds: jsonb('label_ids').notNull().$type<string[]>().default([]),
    // Set by the classifier job; null until classified.
    categoryId: text('category_id').references(() => emailCategory.id, {
      onDelete: 'set null',
    }),
    // Set by the classifier when the message looks like it needs a reply,
    // independent of whether auto-draft actually fired.
    needsReply: boolean('needs_reply').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index('emailMessage_accountId_idx').on(table.accountId),
    index('emailMessage_threadId_idx').on(table.threadId),
    index('emailMessage_categoryId_idx').on(table.categoryId),
    index('emailMessage_accountId_folder_idx').on(table.accountId, table.folder),
    uniqueIndex('emailMessage_accountId_providerMessageId_idx').on(
      table.accountId,
      table.providerMessageId,
    ),
  ],
);

export type EmailMessage = typeof emailMessage.$inferSelect;
export type NewEmailMessage = typeof emailMessage.$inferInsert;

// EMAIL MESSAGE BODY
// Lazily persisted 1:1 body for a message (docs/email/prd.md, "Sync model").
// Keyed by messageId itself (no separate id) so the row purges automatically
// alongside its message via the cascade FK.
export const emailMessageBody = pgTable('email_message_bodies', {
  messageId: text('message_id')
    .primaryKey()
    .references(() => emailMessage.id, { onDelete: 'cascade' }),
  // Parsed plain-text body.
  textBody: text('text_body'),
  // Sanitized HTML body.
  htmlBody: text('html_body'),
  ...timestamps,
});

export type EmailMessageBody = typeof emailMessageBody.$inferSelect;
export type NewEmailMessageBody = typeof emailMessageBody.$inferInsert;

// EMAIL DRAFT
// Single home for every unsent message, regardless of origin.
export const emailDraft = pgTable(
  'email_drafts',
  {
    id: primaryIdColumn,
    accountId: text('account_id')
      .notNull()
      .references(() => emailAccount.id, { onDelete: 'cascade' }),
    origin: text('origin').notNull().$type<EmailDraftOrigin>(),
    kind: text('kind').notNull().$type<EmailDraftKind>(),
    // Null for `kind: 'new'`, which has no thread yet.
    threadId: text('thread_id').references(() => emailThread.id, { onDelete: 'cascade' }),
    // Null once the source message is purged; the draft survives pointing
    // only at its thread. For `kind: 'reply'` this is the message being
    // replied to; for `kind: 'forward'` the message being forwarded.
    replyToMessageId: text('reply_to_message_id').references(() => emailMessage.id, {
      onDelete: 'set null',
    }),
    // Null for `origin: 'user'`, which has no agent. No onDelete action: the
    // agent that produced a draft must stay resolvable for review, same
    // reasoning as media.schema.ts's mediaId FKs.
    agentId: text('agent_id').references(() => agent.id),
    to: jsonb('to').notNull().$type<EmailParticipant[]>().default([]),
    cc: jsonb('cc').notNull().$type<EmailParticipant[]>().default([]),
    bcc: jsonb('bcc').notNull().$type<EmailParticipant[]>().default([]),
    subject: text('subject'),
    // HTML (canonical), edited by the user via the now-HTML-native Tiptap
    // instance (docs/email/html-content-change-request.md).
    content: text('content').notNull().default(''),
    // Plain-text MIME sibling of `content`, always written alongside it by
    // whichever producer wrote `content` (browser Tiptap getText(), or the
    // worker/API's html-to-text helper); never derived at send time
    // (docs/email/html-content-change-request.md, "Scope > 3").
    text: text('text').notNull().default(''),
    // Quoted history rendered read-only in a sandboxed iframe, kept out of
    // the editable `content`/`text` above so the compose editor never parses
    // sender-authored HTML into the app's own DOM. Null means no quote
    // (`kind: 'new'`, or a draft created before this column existed - not
    // migrated, see below); server-authored only, written once at creation
    // or by the worker, never client-writable via PATCH
    // (docs/email/quote-iframe-change-request.md, "Scope > 1").
    quotedHtml: text('quoted_html'),
    // Plain-text sibling of `quotedHtml`, same null semantics.
    quotedText: text('quoted_text'),
    // The forwarded message's carried-over attachment set; see
    // EmailDraftAttachment above.
    attachments: jsonb('attachments').notNull().$type<EmailDraftAttachment[]>().default([]),
    status: text('status').notNull().$type<EmailDraftStatus>().default('generating'),
    // Null until pushed to the provider; stable across provider-side updates, unlike the message id it wraps.
    providerDraftId: text('provider_draft_id'),
    ...timestamps,
  },
  (table) => [
    index('emailDraft_accountId_idx').on(table.accountId),
    index('emailDraft_threadId_idx').on(table.threadId),
    index('emailDraft_replyToMessageId_idx').on(table.replyToMessageId),
    index('emailDraft_agentId_idx').on(table.agentId),
    index('emailDraft_providerDraftId_idx').on(table.providerDraftId),
    uniqueIndex('emailDraft_accountId_providerDraftId_idx').on(
      table.accountId,
      table.providerDraftId,
    ),
  ],
);

export type EmailDraft = typeof emailDraft.$inferSelect;
export type NewEmailDraft = typeof emailDraft.$inferInsert;
