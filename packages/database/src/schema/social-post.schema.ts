import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { primaryIdColumn, timestamps } from './common.schema';
import { user } from './user.schema';

export type SocialPlatform = 'linkedin';
export type SocialPostStatus = 'draft' | 'published' | 'failed';
export type SocialPostSource = 'agent' | 'user';

// SOCIAL POST
export const socialPost = pgTable(
  'social_posts',
  {
    id: primaryIdColumn,
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
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
  (table) => [index('socialPost_userId_idx').on(table.userId)],
);

export type SocialPost = typeof socialPost.$inferSelect;
export type NewSocialPost = typeof socialPost.$inferInsert;
