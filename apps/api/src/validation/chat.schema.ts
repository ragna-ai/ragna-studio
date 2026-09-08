import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';

const primaryId = z.uuidv7();

export const validChatIdParam = myzValidator(
  'param',
  z.object({
    chatId: primaryId,
  }),
);

export const validChatAttachmentParams = myzValidator(
  'param',
  z.object({
    chatId: primaryId,
    attachmentId: primaryId,
  }),
);

// workspaceId comes from the path (`/workspace/:workspaceId/chat`, guarded by
// workspaceGuard), never the body.
export const validCreateChatBody = myzValidator(
  'json',
  z.object({
    agentId: primaryId.optional(),
  }),
);

export const validUpdateChatTitleBody = myzValidator(
  'json',
  z.object({
    title: z.string().trim().min(1).max(255),
  }),
);

export const validBranchChatBody = myzValidator(
  'json',
  z.object({
    messageId: primaryId,
  }),
);

// [GET] /workspace/:workspaceId/chat/search (docs/chat/search-prd.md). `q`'s
// 3-char floor isn't just UX: pg_trgm matches on 3-character trigrams, so
// shorter queries have too few trigrams to use the index effectively.
export const validChatSearchQuery = myzValidator(
  'query',
  z.object({
    q: z.string().trim().min(3),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    snippetsPerChat: z.coerce.number().int().min(1).max(20).optional().default(3),
    // false (default) uses ILIKE, true switches title and message matching
    // to case-sensitive LIKE. Same gin_trgm_ops index serves both.
    //
    // Not z.coerce.boolean(): query params always arrive as strings, and
    // `Boolean("false")` is `true` in JS (any non-empty string is truthy),
    // so an explicit `?caseSensitive=false` would coerce to `true`.
    // `stringbool()` is Zod's purpose-built fix: it parses the literal
    // string ("true"/"false", among other recognized spellings) and rejects
    // anything else, instead of relying on JS truthiness.
    caseSensitive: z.stringbool().default(false),
  }),
);
