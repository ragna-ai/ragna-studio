import { index, pgTable, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { primaryIdColumn } from './common.schema';
import { user } from './user.schema';

// Table shapes follow the better-auth organization plugin; export names must match its model names.
export const organization = pgTable('organizations', {
  id: primaryIdColumn,
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  metadata: text('metadata'),
  createdAt: timestamp('created_at').notNull(),
  deletedAt: timestamp('deleted_at'),
});

export const organizationMember = pgTable(
  'members',
  {
    id: primaryIdColumn,
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    unique('members_organization_id_user_id_unique').on(table.organizationId, table.userId),
    uniqueIndex('member_userId_unique').on(table.userId),
  ],
);

export const invitation = pgTable(
  'invitations',
  {
    id: primaryIdColumn,
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role'),
    status: text('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at').notNull(),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [index('invitation_organizationId_idx').on(table.organizationId)],
);

export type Organization = typeof organization.$inferSelect;
export type OrganizationMember = typeof organizationMember.$inferSelect;
export type Invitation = typeof invitation.$inferSelect;
