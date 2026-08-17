// Mirrors apps/api/src/services/email.service.ts response shapes (read-only
// for this feature, see apps/api ownership note in docs/email/prd.md).
// Dates cross the wire as ISO strings (JSON has no Date type), never `Date`.

export type EmailAccountSyncState = 'idle' | 'syncing' | 'error';

// Matches apps/api/src/validation/email.schema.ts's `emailFolderEnum`.
export type EmailFolder = 'inbox' | 'archived' | 'trashed' | 'starred' | 'sent';

export type EmailDraftStatus = 'generating' | 'ready' | 'discarded' | 'sent';
export type EmailDraftOrigin = 'ai' | 'user';
export type EmailDraftKind = 'new' | 'reply' | 'forward';

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
  unreadOnly: boolean;
  starredOnly: boolean;
  dateFrom: string | null;
  dateTo: string | null;
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
  body: { text: string | null; html: string | null };
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

/**
 * `POST /email/thread/bulk/trash` request body
 * (apps/api/src/validation/email.schema.ts's `validBulkTrashThreadsBody`).
 * Capped at 50 ids server-side; the UI enforces the same cap before sending
 * (useEmailThreadSelection.ts's `BULK_TRASH_MAX_SELECTION`).
 */
export interface EmailBulkTrashRequest {
  threadIds: string[];
}

/** One requested thread's outcome - `ok: false` for a thread that failed (not found, provider error) without failing the rest of the batch (email.service.ts's `bulkSetThreadsTrashedForUser`). */
export interface EmailBulkTrashResult {
  threadId: string;
  ok: boolean;
}

export interface EmailBulkTrashResponse {
  results: EmailBulkTrashResult[];
}

// --- Search -------------------------------------------------------------

export interface EmailSearchResponse {
  threads: EmailThreadSummary[];
  nextPageToken: string | null;
}

// --- Compose / send --------------------------------------------------------
// Every compose flow (new/reply/reply-all/forward/AI) now edits a persisted
// draft row first (docs/email/drafts-change-request.md, "One draft object
// for all four cases"), so `POST /email/send` and its plain (non-draft)
// request shape have no remaining caller - sending always goes through
// `POST /email/draft/:draftId/send` below.

export interface SendEmailResponse {
  messageId: string;
  threadId: string;
}

export interface SendEmailDraftVariables {
  draftId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text: string;
  /** Final edited HTML, only sent when the draft was changed in the editor. */
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
// Wire contract per docs/email/drafts-change-request.md ("Wire contract"):
// the draft DTO is the `email_drafts` row as-is, dates as ISO strings.

export interface EmailDraftAttachment {
  /** Null when the attachment lives on the Gmail draft itself rather than a forwarded message. */
  providerMessageId: string | null;
  providerAttachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId: string | null;
  inline: boolean;
}

export interface EmailDraft {
  id: string;
  accountId: string;
  origin: EmailDraftOrigin;
  kind: EmailDraftKind;
  threadId: string | null;
  replyToMessageId: string | null;
  agentId: string | null;
  to: EmailParticipant[];
  cc: EmailParticipant[];
  bcc: EmailParticipant[];
  subject: string | null;
  /** HTML (docs/email/html-content-change-request.md flips this from markdown). */
  content: string;
  /** Plain-text MIME sibling of `content`, always written alongside it. */
  text: string;
  /** Read-only quoted history, rendered via EmailContentIframe - never client-writable (docs/email/quote-iframe-change-request.md). Null for kind: 'new', or a draft created before this field existed. */
  quotedHtml: string | null;
  /** Plain-text sibling of quotedHtml, same null semantics. */
  quotedText: string | null;
  attachments: EmailDraftAttachment[];
  status: EmailDraftStatus;
  providerDraftId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailDraftListResponse {
  drafts: EmailDraft[];
}

export interface EmailDraftResponse {
  draft: EmailDraft;
}

/**
 * The full set of fields EmailComposer.vue reports back on every change
 * (recipients, subject, body HTML/text, forwarded-attachment set), so
 * EmailDraftPanel.vue can debounce them into one `PATCH /email/draft/:id`
 * call without reaching into the composer's internal editor/refs. `content`
 * and `text` are always sent together (docs/email/html-content-change-request.md,
 * "Scope > 3"): one editor snapshot, never one without the other.
 */
export interface EmailDraftEditableFields {
  to: EmailParticipant[];
  cc: EmailParticipant[];
  bcc: EmailParticipant[];
  subject: string;
  content: string;
  text: string;
  attachments: EmailDraftAttachment[];
}

export interface CreateEmailDraftRequest {
  kind: EmailDraftKind;
  threadId?: string;
  replyToMessageId?: string;
}

/**
 * `origin`, `kind`, `threadId`, `replyToMessageId` and `agentId` are set at
 * creation only and rejected by PATCH (docs/email/drafts-change-request.md,
 * "API changes"), so this is a distinct, narrower type from `EmailDraft`
 * rather than a `Partial<EmailDraft>` that would still type-check those
 * fields as assignable.
 */
export type UpdateEmailDraftRequest = Partial<EmailDraftEditableFields> & {
  /**
   * Forces the Gmail write-back regardless of the attachment-based push rule
   * (section 3: a draft carrying attachments otherwise only pushes to Gmail
   * when the attachment set itself changes, so body/subject/recipient edits
   * on it would sit local-only indefinitely without this). Not a draft
   * field - never echoed back on `EmailDraft` - so it lives outside
   * `EmailDraftEditableFields`. EmailComposer.vue sets this before send and
   * on its unmount/navigate-away flush; ordinary keystroke autosaves omit
   * it.
   */
  flush?: boolean;
};

/**
 * Body of the 409 `POST /email/draft` returns when the thread already has a
 * non-terminal draft ("refuses a second non-terminal draft on the same
 * thread ... with a 409 carrying the existing draft's id"). The wire
 * contract only specifies the id is included; modeled as the same `{ draft }`
 * envelope as a normal create response so the client can also read the
 * existing draft's `kind` (needed to decide whether to prompt a
 * discard-first flow) - JUDGEMENT CALL, flagged for the API agent to confirm
 * or correct the actual shape.
 */
export interface EmailDraftConflictResponse {
  draft: EmailDraft;
}

export interface TriggerEmailDraftRequest {
  threadId: string;
  replyToMessageId: string;
  agentId?: string;
}
