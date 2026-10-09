import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { primaryIdColumn, timestamps } from './common.schema';
import type { Media } from './media.schema';
import { media } from './media.schema';
import { user } from './user.schema';
import { workspace } from './workspace.schema';

export type SocialPlatform = 'linkedin';
export type SocialPostStatus = 'draft' | 'published' | 'failed';
export type SocialPostSource = 'agent' | 'user';
export type SocialPostMediaOrigin = 'upload' | 'genImage';

// SOCIAL POST
export const socialPost = pgTable(
  'social_posts',
  {
    id: primaryIdColumn,
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull().$type<SocialPlatform>().default('linkedin'),
    content: text('content').notNull(),
    status: text('status').notNull().$type<SocialPostStatus>().default('draft'),
    // v1 drafts always come from the agent tool; v2 adds manual user drafts.
    source: text('source').notNull().$type<SocialPostSource>().default('agent'),
    // Set once a publish attempt succeeds.
    externalId: text('external_id'),
    externalUrl: text('external_url'),
    publishedAt: timestamp('published_at'),
    // Set when a publish attempt fails, so the UI can show why.
    publishError: text('publish_error'),
    ...timestamps,
  },
  (table) => [
    index('socialPost_userId_idx').on(table.userId),
    index('socialPost_workspaceId_idx').on(table.workspaceId),
  ],
);

export type SocialPost = typeof socialPost.$inferSelect;
export type NewSocialPost = typeof socialPost.$inferInsert;

// SOCIAL POST MEDIA
// One row per image attached to a post. Agent-attached images reuse a
// gen_images output's media row directly (no file copy); user uploads get
// their own media row. See social-post.repo.ts and @repo/ai's
// social-post.service.ts for how each path writes this table.
export const socialPostMedia = pgTable(
  'social_post_media',
  {
    id: primaryIdColumn,
    socialPostId: text('social_post_id')
      .notNull()
      .references(() => socialPost.id, { onDelete: 'cascade' }),
    // No onDelete action, same as chat_attachment.media_id: the DB refuses
    // to delete a media row while a social post still points at it.
    mediaId: text('media_id')
      .notNull()
      .references(() => media.id),
    mimeType: text('mime_type').notNull(),
    // 'upload' rows own their R2 object and lose it once refcount hits zero.
    // 'genImage' rows point at a gen_images object they don't own; kept as
    // provenance metadata only, refcount deletion no longer branches on it.
    // See media.service.ts (apps/api) for the delete call sites.
    origin: text('origin').notNull().$type<SocialPostMediaOrigin>(),
    altText: text('alt_text'),
    // Display order within the post, 0-based.
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('socialPostMedia_socialPostId_idx').on(table.socialPostId),
    index('socialPostMedia_mediaId_idx').on(table.mediaId),
  ],
);

export type SocialPostMedia = typeof socialPostMedia.$inferSelect;
export type NewSocialPostMedia = typeof socialPostMedia.$inferInsert;

export type SocialPostMediaWithMedia = SocialPostMedia & { media: Media };
export type SocialPostWithMedia = SocialPost & { media: SocialPostMediaWithMedia[] };
