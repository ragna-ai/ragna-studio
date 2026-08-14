import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { agent } from './agent.schema';
import { primaryIdColumn, timestamps } from './common.schema';
import { user } from './user.schema';

// Gmail is the only implementation that ships in v1; the provider enum and
// opaque syncCursor exist so a second provider (Microsoft Graph) slots in
// later without a schema change (docs/email/prd.md, "Future directions").
export type EmailProvider = 'gmail';

export type EmailAccountSyncState = 'idle' | 'syncing' | 'error';

// Shared shape for from/to/cc columns: Gmail (and any future provider)
// always carries a display name alongside the address.
export interface EmailParticipant {
  name: string | null;
  email: string;
}

export type EmailDraftStatus = 'generating' | 'ready' | 'discarded' | 'sent';

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
    provider: text('provider').notNull().$type<EmailProvider>().default('gmail'),
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
// Metadata index row (docs/email/prd.md, "Sync model"): mirrors Gmail's
// message metadata plus our own category/needsReply columns. The body is
// fetched and persisted lazily, see email_message_bodies below.
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
    // Gmail label ids (system + user labels), read-only display only
    // (docs/email/prd.md, "Non-goals").
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
// Local-only AI reply draft (docs/email/prd.md, "Non-goals": never written to
// Gmail's own drafts folder, never auto-sent).
export const emailDraft = pgTable(
  'email_drafts',
  {
    id: primaryIdColumn,
    accountId: text('account_id')
      .notNull()
      .references(() => emailAccount.id, { onDelete: 'cascade' }),
    threadId: text('thread_id')
      .notNull()
      .references(() => emailThread.id, { onDelete: 'cascade' }),
    // Null once the source message is purged; the draft survives pointing
    // only at its thread.
    replyToMessageId: text('reply_to_message_id').references(() => emailMessage.id, {
      onDelete: 'set null',
    }),
    // No onDelete action: the agent that produced a draft must stay
    // resolvable for review, same reasoning as media.schema.ts's mediaId FKs.
    agentId: text('agent_id')
      .notNull()
      .references(() => agent.id),
    // Markdown, @repo/editor-managed, same convention as document.content.
    content: text('content').notNull().default(''),
    status: text('status').notNull().$type<EmailDraftStatus>().default('generating'),
    ...timestamps,
  },
  (table) => [
    index('emailDraft_accountId_idx').on(table.accountId),
    index('emailDraft_threadId_idx').on(table.threadId),
    index('emailDraft_replyToMessageId_idx').on(table.replyToMessageId),
    index('emailDraft_agentId_idx').on(table.agentId),
  ],
);

export type EmailDraft = typeof emailDraft.$inferSelect;
export type NewEmailDraft = typeof emailDraft.$inferInsert;
