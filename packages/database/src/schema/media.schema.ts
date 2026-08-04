import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { chat } from './chat.schema';
import { primaryIdColumn } from './common.schema';
import { user } from './user.schema';
import { workspace } from './workspace.schema';

export type MediaOrigin = 'uploaded' | 'generated';

// MEDIA
// Central record of every file in R2 (docs/media-library/prd.md). Ownership
// is a set of nullable FK columns instead of a mediable_type/id pair, so
// cascade and the relations graph keep working; the check constraint below
// enforces exactly one owner column is set. v1 only ever writes
// ownerWorkspaceId (chat attachments are workspace-owned); ownerUserId is
// reserved for the personal-library flow described in the PRD but unused
// today.
export const media = pgTable(
  'media',
  {
    id: primaryIdColumn,
    ownerUserId: text('owner_user_id').references(() => user.id, { onDelete: 'cascade' }),
    ownerWorkspaceId: text('owner_workspace_id').references(() => workspace.id, {
      onDelete: 'cascade',
    }),
    // Bucket the object lives in: cfImagesBucketName (public, images) or
    // cfDocumentsBucketName (private, everything else). Kept on the row so
    // deletion never has to guess the bucket from the mime type.
    bucket: text('bucket').notNull(),
    storageKey: text('storage_key').notNull(),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    origin: text('origin').notNull().$type<MediaOrigin>(),
    // Tier-2 docs only (docx/xlsx/txt/md/csv), capped at 50,000 chars with a
    // trailing "[truncated]" marker. Null for images, pdf, and 'generated' media.
    extractedText: text('extracted_text'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('media_ownerWorkspaceId_idx').on(table.ownerWorkspaceId),
    check(
      'media_exactly_one_owner_check',
      sql`num_nonnulls(${table.ownerUserId}, ${table.ownerWorkspaceId}) = 1`,
    ),
  ],
);

export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;

// CHAT ATTACHMENT
// Links a chat to a media row (docs/media-library/prd.md). Deleting a chat
// cascades its attachment rows; the media row itself is only removed once
// its reference count across every link table (this is the only one in v1)
// drops to zero, which media.service.ts (apps/api) drives explicitly. mediaId
// has no onDelete action on purpose: a media row must never be deleted while
// an attachment still points at it.
export const chatAttachment = pgTable(
  'chat_attachments',
  {
    id: primaryIdColumn,
    chatId: text('chat_id')
      .notNull()
      .references(() => chat.id, { onDelete: 'cascade' }),
    mediaId: text('media_id')
      .notNull()
      .references(() => media.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('chatAttachment_chatId_idx').on(table.chatId),
    index('chatAttachment_mediaId_idx').on(table.mediaId),
  ],
);

export type ChatAttachment = typeof chatAttachment.$inferSelect;
export type NewChatAttachment = typeof chatAttachment.$inferInsert;

export type ChatAttachmentWithMedia = ChatAttachment & { media: Media };
