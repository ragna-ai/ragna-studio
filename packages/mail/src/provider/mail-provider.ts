// packages/mail/src/provider/mail-provider.ts
//
// Provider-agnostic mail contract. A `MailProvider` implementation (e.g.
// `GmailProvider`) is the only thing in this package allowed to know about a
// specific vendor's wire format. Every id here (message, thread, label) is an
// opaque string assigned by the provider; callers must not parse or infer
// structure from it.

/** Opaque id assigned by the provider (message, thread, or label). */
export type MailProviderId = string;

export interface MailAddress {
  name?: string;
  address: string;
}

export interface MailAttachmentMeta {
  /** Opaque id, scoped to the message it was found on. Pass to `getAttachment`. */
  id: string;
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
  message: MailMessageMetadata;
}

export interface MailSyncFlagsChanged {
  type: 'flagsChanged';
  messageId: MailProviderId;
  threadId: MailProviderId;
  labelIds: MailProviderId[];
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

// --- Mailbox actions ------------------------------------------------------

export interface MailActionResult {
  messageId: MailProviderId;
  threadId: MailProviderId;
  labelIds: MailProviderId[];
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

  /**
   * Applies mailbox changes since `cursor`: new messages, flag/label
   * changes, and deletions. Returns `{ status: 'cursorExpired' }` instead of
   * throwing when the cursor can no longer be resolved.
   */
  syncFromCursor(cursor: string): Promise<MailSyncOutcome>;

  /** Full thread with every message's body parsed. */
  fetchThread(threadId: MailProviderId): Promise<MailThread>;

  /** Metadata only: no body fetch, no MIME parsing. */
  fetchMessage(messageId: MailProviderId, format: 'metadata'): Promise<MailMessageMetadata>;
  /** Metadata plus parsed body and threading headers. */
  fetchMessage(messageId: MailProviderId, format: 'full'): Promise<MailMessage>;

  /** Sends a new message, or a reply when `input.thread` is set. */
  send(input: SendMailInput): Promise<SendMailResult>;

  /** `archived: true` removes the message from the inbox; `false` restores it. */
  setArchived(messageId: MailProviderId, archived: boolean): Promise<MailActionResult>;
  trashMessage(messageId: MailProviderId): Promise<MailActionResult>;
  setStarred(messageId: MailProviderId, starred: boolean): Promise<MailActionResult>;
  setRead(messageId: MailProviderId, read: boolean): Promise<MailActionResult>;

  listLabels(): Promise<MailLabel[]>;

  /** Proxies the provider's native search query syntax; returns matching thread ids. */
  search(query: string, pageToken?: string | null): Promise<MailSearchResult>;

  getAttachment(messageId: MailProviderId, attachmentId: string): Promise<MailAttachmentContent>;
}
