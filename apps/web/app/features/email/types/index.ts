// Mirrors apps/api/src/services/email.service.ts response shapes (read-only
// for this feature, see apps/api ownership note in docs/email/prd.md).
// Dates cross the wire as ISO strings (JSON has no Date type), never `Date`.

export type EmailAccountSyncState = 'idle' | 'syncing' | 'error';

// Matches apps/api/src/validation/email.schema.ts's `emailFolderEnum`.
export type EmailFolder = 'inbox' | 'archived' | 'trashed' | 'starred' | 'sent';

export type EmailDraftStatus = 'generating' | 'ready' | 'discarded' | 'sent';

export interface EmailParticipant {
  name: string | null;
  email: string;
}

// --- Account --------------------------------------------------------------

export interface EmailAccount {
  id: string;
  email: string;
  defaultAgentId: string | null;
  syncState: EmailAccountSyncState;
  lastSyncedAt: string | null;
}

export interface EmailAccountStatusResponse {
  connected: boolean;
  account: EmailAccount | null;
}

export interface UpdateEmailAccountSettingsRequest {
  defaultAgentId?: string | null;
}

// --- Categories -------------------------------------------------------------

export interface EmailCategory {
  id: string;
  accountId: string;
  name: string;
  description: string;
  color: string;
  autoDraft: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailCategoryListResponse {
  categories: EmailCategory[];
}

export interface EmailCategoryResponse {
  category: EmailCategory;
}

export interface CreateEmailCategoryRequest {
  name: string;
  description?: string;
  color: string;
  autoDraft?: boolean;
}

export type UpdateEmailCategoryRequest = Partial<CreateEmailCategoryRequest>;

// --- Auto-draft senders -----------------------------------------------------

export interface EmailAutoDraftSender {
  id: string;
  accountId: string;
  senderEmail: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailAutoDraftSenderListResponse {
  senders: EmailAutoDraftSender[];
}

export interface EmailAutoDraftSenderResponse {
  sender: EmailAutoDraftSender;
}

// --- Threads / messages ------------------------------------------------------

export interface EmailThreadSummary {
  id: string;
  subject: string | null;
  snippet: string | null;
  lastMessageAt: string | null;
  participants: EmailParticipant[];
  labelIds: string[];
  categoryId: string | null;
  isUnread: boolean;
  /** Any message in the thread is starred (email.service.ts's hydrateThreadSummary). */
  isStarred: boolean;
  messageCount: number;
}

export interface EmailThreadListResponse {
  threads: EmailThreadSummary[];
  hasMore: boolean;
}

// Non-optional (still nullable): EmailClient.vue's `filters` computed is the
// only place that constructs one, and it always sets all three - keeping
// them required means callers reading `filters.folder` etc. never have to
// handle a spurious `undefined` on top of the real `null` "not set" case.
export interface EmailThreadListFilters {
  categoryId: string | null;
  labelId: string | null;
  folder: EmailFolder | null;
}

export interface EmailMessageDetail {
  id: string;
  from: EmailParticipant;
  to: EmailParticipant[];
  cc: EmailParticipant[];
  subject: string | null;
  sentAt: string;
  isUnread: boolean;
  isStarred: boolean;
  labelIds: string[];
  categoryId: string | null;
  needsReply: boolean;
  body: { markdown: string | null };
}

export interface EmailThreadDetailResponse {
  thread: EmailThreadSummary;
  messages: EmailMessageDetail[];
}

/**
 * Row shape returned by the mailbox action endpoints (message/thread
 * archive/trash/star/read) - apps/api's email.service.ts applyMessageAction
 * and applyActionToMessages return the raw `EmailMessage` DB row
 * (packages/database/src/schema/email.schema.ts), not the hydrated detail
 * response. That row has no `body`: it's a separate 1:1 table
 * (`email_message_bodies`), only ever joined in by
 * getEmailThreadDetailForUser. Defined as `Omit<EmailMessageDetail, 'body'>`
 * (not a hand-duplicated field list) so the two can never silently drift
 * apart. Do not add `body` back here - a cached EmailMessageDetail merged
 * against one of these must keep its own `body`, see patchThreadDetail in
 * lib/email-thread-cache.ts.
 */
export type EmailMessageActionRow = Omit<EmailMessageDetail, 'body'>;

export interface EmailMessageActionResponse {
  message: EmailMessageActionRow;
}

export interface EmailThreadActionResponse {
  messages: EmailMessageActionRow[];
}

// --- Search -------------------------------------------------------------

export interface EmailSearchResponse {
  threads: EmailThreadSummary[];
  nextPageToken: string | null;
}

// --- Compose / send --------------------------------------------------------

export interface SendEmailResponse {
  messageId: string;
  threadId: string;
}

export interface SendEmailVariables {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text: string;
  threadId?: string;
  replyToMessageId?: string;
  mediaIds?: string[];
  files?: File[];
  draftId?: string;
}

export interface SendEmailDraftVariables {
  draftId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text: string;
  /** Final edited markdown, only sent when the draft was changed in the editor. */
  content?: string;
  mediaIds?: string[];
  files?: File[];
}

// --- Media (attach from the media library) ---------------------------------

/** GET /workspace/:workspaceId/media row (apps/api's media.controller.ts). */
export interface MediaListItem {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface MediaListResponse {
  media: MediaListItem[];
}

// --- Drafts ---------------------------------------------------------------

export interface EmailDraft {
  id: string;
  accountId: string;
  threadId: string;
  replyToMessageId: string | null;
  agentId: string;
  content: string;
  status: EmailDraftStatus;
  createdAt: string;
  updatedAt: string;
}

export interface EmailDraftListResponse {
  drafts: EmailDraft[];
}

export interface EmailDraftResponse {
  draft: EmailDraft;
}

export interface TriggerEmailDraftRequest {
  threadId: string;
  replyToMessageId: string;
  agentId?: string;
}
