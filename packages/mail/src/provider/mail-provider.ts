// packages/mail/src/provider/mail-provider.ts
//
// Provider-agnostic mail contract. A `MailProvider` implementation (e.g.
// `GmailProvider`) is the only thing in this package allowed to know about a
// specific vendor's wire format. Every id here (message, thread, label) is an
// opaque string assigned by the provider; callers must not parse or infer
// structure from it.

/** Opaque id assigned by the provider (message, thread, or label). */
export type MailProviderId = string;

export type MailFolder = 'inbox' | 'sent' | 'archive' | 'trash' | 'spam' | 'draft';

export interface MailAddress {
  name?: string;
  address: string;
}

export interface MailAttachmentMeta {
  /** Stable across read/label/star changes (unlike attachmentId). */
  partId: string;
  /**
   * Opaque, provider-issued token to fetch this attachment's bytes: pass to
   * `getAttachment` for a `MailMessage`'s attachment, or to
   * `getDraftAttachment` (with the draft id, not a message id) for a
   * `MailDraft`'s attachment. Not guaranteed stable once the message is
   * modified - re-resolve it from a fresh fetch rather than persisting it
   * or round-tripping it through a client across requests.
   */
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  /** Present when the attachment is referenced inline via `cid:` in the HTML body. */
  contentId?: string;
  inline: boolean;
}

export interface MailAttachmentInput {
  filename: string;
  mimeType: string;
  content: Buffer;
  /** Set to embed the attachment inline and reference it via `cid:` in the HTML body. */
  contentId?: string;
}

export interface MailBody {
  text: string | null;
  html: string | null;
  attachments: MailAttachmentMeta[];
}

export interface MailMessageMetadata {
  id: MailProviderId;
  threadId: MailProviderId;
  from: MailAddress | null;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  subject: string | null;
  snippet: string;
  date: Date;
  labelIds: MailProviderId[];
  folder: MailFolder;
  unread: boolean;
  starred: boolean;
}

export interface MailMessage extends MailMessageMetadata {
  body: MailBody;
  /** RFC 822 `Message-ID` header, needed to thread a reply via `send`. */
  messageIdHeader: string | null;
  inReplyTo: string | null;
  /** Parsed `References` header, oldest first. */
  references: string[];
}

export interface MailThread {
  id: MailProviderId;
  messages: MailMessage[];
}

export interface MailAccountProfile {
  emailAddress: string;
  /** Opaque sync cursor to start `syncFromCursor` from on first connect. */
  cursor: string;
}

// --- Sync -------------------------------------------------------------

export interface MailSyncMessageAdded {
  type: 'added';
  /** May name an already-indexed message (e.g. Graph delta); upsert, don't assume new. */
  message: MailMessageMetadata;
}

export interface MailSyncFlagsChanged {
  type: 'flagsChanged';
  messageId: MailProviderId;
  threadId: MailProviderId;
  labelIds: MailProviderId[];
  folder: MailFolder;
  unread: boolean;
  starred: boolean;
}

export interface MailSyncMessageDeleted {
  type: 'deleted';
  messageId: MailProviderId;
  threadId: MailProviderId;
}

export type MailSyncChange = MailSyncMessageAdded | MailSyncFlagsChanged | MailSyncMessageDeleted;

export interface MailSyncResult {
  status: 'ok';
  changes: MailSyncChange[];
  nextCursor: string;
}

/**
 * The cursor is too old for the provider to resolve (e.g. an expired Gmail
 * `historyId`). The caller must fall back to a full resync: re-list the
 * mailbox from scratch and start a new cursor from `getProfile`.
 */
export interface MailSyncCursorExpired {
  status: 'cursorExpired';
}

export type MailSyncOutcome = MailSyncResult | MailSyncCursorExpired;

// --- Send ---------------------------------------------------------------

export interface SendMailThreadingInput {
  threadId: MailProviderId;
  /** `Message-ID` header of the message being replied to. */
  inReplyToMessageId: string;
  /** Prior `References` chain, oldest first; `inReplyToMessageId` is appended automatically. */
  references?: string[];
  /** Gmail ignores this; Microsoft Graph needs it for createReply/createForward. */
  replyToProviderMessageId: MailProviderId;
}

export interface SendMailInput {
  to: MailAddress[];
  cc?: MailAddress[];
  bcc?: MailAddress[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: MailAttachmentInput[];
  /** Omit for a new thread; set to send a reply with proper threading headers. */
  thread?: SendMailThreadingInput;
}

export interface SendMailResult {
  messageId: MailProviderId;
  threadId: MailProviderId;
}

// --- Drafts -----------------------------------------------------------

/** Persist only `id`; the contained message's id changes on every `updateDraft`. */
export interface MailDraftSummary {
  id: MailProviderId;
  threadId: MailProviderId;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  subject: string | null;
  snippet: string;
  date: Date;
}

/** Full draft: `MailDraftSummary` plus the parsed body and attachment metadata. */
export interface MailDraft extends MailDraftSummary {
  body: MailBody;
}

// --- Mailbox actions ------------------------------------------------------

export interface MailActionResult {
  messageId: MailProviderId;
  threadId: MailProviderId;
  labelIds: MailProviderId[];
  folder: MailFolder;
  unread: boolean;
  starred: boolean;
}

// --- Labels / search / attachments ----------------------------------------

export interface MailLabel {
  id: MailProviderId;
  name: string;
  type: 'system' | 'user';
}

export interface MailSearchResult {
  threadIds: MailProviderId[];
  nextPageToken: string | null;
}

export interface MailAttachmentContent {
  size: number;
  data: Buffer;
}

/**
 * Provider-agnostic mailbox contract. Implementations own token handling and
 * all vendor-specific wire formats; callers (services, worker jobs) speak
 * only in these terms so a second provider (e.g. Microsoft Graph) can be
 * dropped in later without touching call sites.
 */
export interface MailProvider {
  /** Connected account's address and the cursor to start syncing from. */
  getProfile(): Promise<MailAccountProfile>;

  /** Returns `cursorExpired` instead of throwing when the cursor can't be resolved. */
  syncFromCursor(cursor: string): Promise<MailSyncOutcome>;

  /** Full thread with every message's body parsed. */
  fetchThread(threadId: MailProviderId): Promise<MailThread>;

  /** Metadata only: no body fetch, no MIME parsing. */
  fetchMessage(messageId: MailProviderId, format: 'metadata'): Promise<MailMessageMetadata>;
  /** Metadata plus parsed body and threading headers. */
  fetchMessage(messageId: MailProviderId, format: 'full'): Promise<MailMessage>;

  /** Sends a new message, or a reply when `input.thread` is set. */
  send(input: SendMailInput): Promise<SendMailResult>;

  /** Set `input.thread` for a reply/forward draft. */
  createDraft(input: SendMailInput): Promise<MailDraft>;

  /** No partial update: re-supply `input.thread` on every call. */
  updateDraft(draftId: MailProviderId, input: SendMailInput): Promise<MailDraft>;

  getDraft(draftId: MailProviderId): Promise<MailDraft>;

  /** Every draft in the mailbox, for the Drafts folder listing. Paginates internally. */
  listDrafts(): Promise<MailDraftSummary[]>;

  /** The provider deletes the draft server-side; same result shape as `send`. */
  sendDraft(draftId: MailProviderId): Promise<SendMailResult>;

  deleteDraft(draftId: MailProviderId): Promise<void>;

  /** `archived: true` removes the message from the inbox; `false` restores it. */
  setArchived(messageId: MailProviderId, archived: boolean): Promise<MailActionResult>;
  /** `trashed: true` moves the message to trash; `false` restores it to the inbox. */
  setTrashed(messageId: MailProviderId, trashed: boolean): Promise<MailActionResult>;
  setStarred(messageId: MailProviderId, starred: boolean): Promise<MailActionResult>;
  setRead(messageId: MailProviderId, read: boolean): Promise<MailActionResult>;

  listLabels(): Promise<MailLabel[]>;

  /** Proxies the provider's native search query syntax; returns matching thread ids. */
  search(query: string, pageToken?: string | null): Promise<MailSearchResult>;

  listRecentInboxThreadIds(limit: number): Promise<MailProviderId[]>;

  getAttachment(messageId: MailProviderId, attachmentId: string): Promise<MailAttachmentContent>;

  /**
   * Same as `getAttachment`, addressed by draft id instead of message id.
   * A draft's contained message id changes on every `updateDraft`, so a
   * caller can never hold one to pass to `getAttachment`; an attachment on a
   * draft is therefore only ever reachable through the draft it belongs to.
   */
  getDraftAttachment(draftId: MailProviderId, attachmentId: string): Promise<MailAttachmentContent>;
}
