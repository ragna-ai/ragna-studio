import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';

const primaryId = z.uuidv7();

// 3 or 6 digit hex color, e.g. #f00 or #ff0000, mirrors task-label.schema.ts.
const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'color must be a hex string, e.g. #4287f5');

// --- Account ----------------------------------------------------------

export const validConnectEmailAccountBody = myzValidator(
  'json',
  z.object({
    provider: z.enum(['gmail', 'microsoft']),
  }),
);

export const validUpdateEmailAccountSettingsBody = myzValidator(
  'json',
  z.object({
    defaultAgentId: primaryId.nullish(),
  }),
);

// --- Categories ---------------------------------------------------------

export const validEmailCategoryIdParam = myzValidator(
  'param',
  z.object({
    categoryId: primaryId,
  }),
);

export const validCreateEmailCategoryBody = myzValidator(
  'json',
  z.object({
    name: z.string().min(1).max(100),
    // Fed to the classifier prompt as-is (specs/email/prd.md), so it stays
    // free text rather than a machine-readable rule.
    description: z.string().max(2_000).optional(),
    color: hexColor,
    autoDraft: z.boolean().optional(),
  }),
);

export const validUpdateEmailCategoryBody = myzValidator(
  'json',
  z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(2_000).optional(),
    color: hexColor.optional(),
    autoDraft: z.boolean().optional(),
  }),
);

// --- Auto-draft senders ---------------------------------------------------

export const validAutoDraftSenderIdParam = myzValidator(
  'param',
  z.object({
    senderId: primaryId,
  }),
);

export const validCreateAutoDraftSenderBody = myzValidator(
  'json',
  z.object({
    senderEmail: z.email(),
  }),
);

// --- Threads / messages ---------------------------------------------------

export const validEmailThreadIdParam = myzValidator(
  'param',
  z.object({
    threadId: primaryId,
  }),
);

export const validEmailMessageIdParam = myzValidator(
  'param',
  z.object({
    messageId: primaryId,
  }),
);

// Attachment ids are opaque provider strings, scoped to the message they
// were found on (mail-provider.ts's MailAttachmentMeta), not our own primary
// ids, so no uuidv7 shape check here.
export const validEmailAttachmentParams = myzValidator(
  'param',
  z.object({
    messageId: primaryId,
    partId: z.string().min(1),
  }),
);

const emailFolderEnum = z.enum(['inbox', 'archived', 'trashed', 'starred', 'sent']);

export const validEmailThreadListQuery = myzValidator(
  'query',
  z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    categoryId: primaryId.optional(),
    // Read-only label chip filter: Gmail label id or Outlook category name.
    labelId: z.string().min(1).optional(),
    folder: emailFolderEnum.optional(),
    // stringbool(), not coerce.boolean(): query params arrive as strings,
    // and `Boolean("false")` is `true` in JS, so `?unreadOnly=false` would
    // otherwise coerce to `true` (specs/chat/search-prd.md's caseSensitive
    // hit this same trap; fixed here opportunistically).
    unreadOnly: z.stringbool().optional(),
    starredOnly: z.stringbool().optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
  }),
);

export const validEmailSearchQuery = myzValidator(
  'query',
  z.object({
    q: z.string().min(1),
    pageToken: z.string().optional(),
  }),
);

// --- Mailbox actions --------------------------------------------------

export const validArchiveActionBody = myzValidator(
  'json',
  z.object({
    archived: z.boolean(),
  }),
);

export const validTrashActionBody = myzValidator(
  'json',
  z.object({
    trashed: z.boolean(),
  }),
);

// Batch size cap of 50 (specs/email/mass-deletion-change-request.md, "Batch
// size cap"): keeps worst-case Gmail call volume within a single synchronous
// request, since there's no background job for this.
export const validBulkTrashThreadsBody = myzValidator(
  'json',
  z.object({
    threadIds: z.array(primaryId).min(1).max(50),
  }),
);

export const validStarActionBody = myzValidator(
  'json',
  z.object({
    starred: z.boolean(),
  }),
);

export const validReadActionBody = myzValidator(
  'json',
  z.object({
    read: z.boolean(),
  }),
);

// --- Drafts ---------------------------------------------------------------

export const validEmailDraftIdParam = myzValidator(
  'param',
  z.object({
    draftId: primaryId,
  }),
);

// threadId absent means "every non-terminal draft on the account", the
// Drafts folder (specs/email/drafts-change-request.md, "Wire contract").
export const validEmailDraftListQuery = myzValidator(
  'query',
  z.object({
    threadId: primaryId.optional(),
  }),
);

const emailParticipantSchema = z.object({
  name: z.string().nullable(),
  email: z.email(),
});

// A forward draft's carried-over attachment set, mirrors
// EmailDraftAttachment (packages/database/src/schema/email.schema.ts).
// `providerMessageId` is null when the attachment lives on the Gmail draft
// itself rather than on a forwarded message (specs/email/
// drafts-change-request.md, "Wire contract").
const emailDraftAttachmentSchema = z.object({
  providerMessageId: z.string().min(1).nullable(),
  providerAttachmentId: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  contentId: z.string().nullable(),
  inline: z.boolean(),
});

// [POST] /email/draft. `reply`/`forward` need a thread the caller owns;
// `new` seeds nothing (email.service.ts's createEmailDraftForUser validates
// the kind-specific combination beyond what the shape alone can express).
export const validCreateEmailDraftBody = myzValidator(
  'json',
  z.object({
    kind: z.enum(['new', 'reply', 'forward']),
    threadId: primaryId.optional(),
    replyToMessageId: primaryId.optional(),
  }),
);

// [PATCH] /email/draft/:draftId - the full editable set. `origin`, `kind`,
// `threadId`, `replyToMessageId` and `agentId` are creation-only
// (specs/email/drafts-change-request.md, "Wire contract"): `strictObject`
// rejects them (and any other unknown key) with a 422 instead of silently
// ignoring them.
export const validUpdateEmailDraftBody = myzValidator(
  'json',
  z.strictObject({
    to: z.array(emailParticipantSchema).optional(),
    cc: z.array(emailParticipantSchema).optional(),
    bcc: z.array(emailParticipantSchema).optional(),
    subject: z.string().nullable().optional(),
    content: z.string().optional(),
    // Plain-text MIME sibling of `content`, same optional/partial shape
    // (specs/email/html-content-change-request.md, "Scope > 3"): the client
    // sends both together on every autosave, but either can be omitted to
    // leave the stored value untouched.
    text: z.string().optional(),
    attachments: z.array(emailDraftAttachmentSchema).optional(),
    // Explicit "push to Gmail now regardless of the attachment debounce
    // rule" signal (specs/email/drafts-change-request.md, "Wire contract").
    // The client sets this on panel close and before send; control-only,
    // never persisted on the row.
    flush: z.boolean().optional(),
  }),
);

// Manual "Draft with AI" trigger. agentId overrides the account default for
// this run only (specs/email/prd.md, "Auto-draft replies").
export const validTriggerEmailDraftBody = myzValidator(
  'json',
  z.object({
    threadId: primaryId,
    replyToMessageId: primaryId,
    agentId: primaryId.optional(),
  }),
);

// --- Compose / send (multipart) --------------------------------------------
//
// `POST /email/send` and `POST /email/draft/:draftId/send` are the only
// multipart/form-data routes in this controller (file uploads), so they're
// validated against the 'form' target instead of 'json'. Verified against
// the installed hono@4.13.1 / @hono/zod-validator@0.9.0: hono's form
// validator builds its value object straight from `FormData#forEach`, so a
// field sent once arrives as a bare value, a field sent repeatedly arrives
// as an array, and File entries stay File instances (not strings) - the
// preprocessors below normalize those shapes into what the service layer
// expects.

// `to`/`cc`/`bcc`/`mediaId` are repeated address/id fields. Mirrors the old
// parseStringArray helper: absent -> [], one value -> [value], repeated ->
// the array, and any non-string entry is silently dropped (unchanged from
// before).
const repeatedStringField = z.preprocess((value) => {
  const values = value === undefined ? [] : Array.isArray(value) ? value : [value];
  return values.filter((entry): entry is string => typeof entry === 'string');
}, z.array(z.string()));

// `files` has the same single-vs-array ambiguity as the string fields
// above, but for uploads. Unlike the old parseFiles helper, a non-File
// entry now fails validation instead of being silently filtered out.
const repeatedFileField = z.preprocess((value) => {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}, z.array(z.instanceof(File)));

// Single-value optional fields (html/text/content/threadId/...). Mirrors
// the old parseOptionalString helper: a non-string or empty-string value
// collapses to `undefined` rather than failing validation.
const optionalFormString = z.preprocess((value) => {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return value;
}, z.string().optional());

// Subject was previously a hand-rolled 400 (BadRequestException) in the
// controller; moving it into the schema makes a missing subject a 422 like
// every other validated body, which is an intended consistency change.
const subjectField = z.preprocess(
  (value) => (typeof value === 'string' ? value : ''),
  z.string().trim().min(1, 'Subject is required'),
);

const sendEmailBaseSchema = z.object({
  to: repeatedStringField,
  cc: repeatedStringField,
  bcc: repeatedStringField,
  subject: subjectField,
  html: optionalFormString,
  text: optionalFormString,
  mediaId: repeatedStringField,
  files: repeatedFileField,
});

export const validSendEmailBody = myzValidator(
  'form',
  sendEmailBaseSchema.extend({
    threadId: optionalFormString,
    replyToMessageId: optionalFormString,
    draftId: optionalFormString,
  }),
);

export const validSendEmailDraftBody = myzValidator(
  'form',
  sendEmailBaseSchema.extend({
    content: optionalFormString,
  }),
);
