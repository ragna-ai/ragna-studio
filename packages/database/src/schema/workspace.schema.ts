import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { primaryIdColumn, timestamps } from './common.schema';
import { organization } from './organization.schema';
import { user } from './user.schema';

export const WORKSPACE_VISIBILITY_PERSONAL = 'personal';
export const WORKSPACE_VISIBILITY_ORGANIZATION = 'organization';
export const WORKSPACE_VISIBILITY_RESTRICTED = 'restricted';

export type WorkspaceVisibility =
  | typeof WORKSPACE_VISIBILITY_PERSONAL
  | typeof WORKSPACE_VISIBILITY_ORGANIZATION
  | typeof WORKSPACE_VISIBILITY_RESTRICTED;

export const WORKSPACE_MANAGER_ROLE = 'manager';
export const WORKSPACE_EDITOR_ROLE = 'editor';

export type WorkspaceRole = typeof WORKSPACE_MANAGER_ROLE | typeof WORKSPACE_EDITOR_ROLE;

export const workspace = pgTable(
  'workspaces',
  {
    id: primaryIdColumn,
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    visibility: text('visibility')
      .$type<WorkspaceVisibility>()
      .notNull()
      .default(WORKSPACE_VISIBILITY_ORGANIZATION),
    personalUserId: text('personal_user_id').references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [
    index('workspace_organizationId_idx').on(table.organizationId),
    uniqueIndex('workspace_personalUserId_unique').on(table.personalUserId),
    check(
      'workspace_visibility_check',
      sql`${table.visibility} IN ('personal', 'organization', 'restricted')`,
    ),
    check(
      'workspace_personal_user_check',
      sql`(${table.visibility} = 'personal') = (${table.personalUserId} IS NOT NULL)`,
    ),
  ],
);

export const workspaceMember = pgTable(
  'workspace_members',
  {
    id: primaryIdColumn,
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').$type<WorkspaceRole>().notNull(),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (table) => [
    uniqueIndex('workspaceMember_workspaceId_userId_unique').on(table.workspaceId, table.userId),
    index('workspaceMember_userId_idx').on(table.userId),
    check('workspaceMember_role_check', sql`${table.role} IN ('manager', 'editor')`),
  ],
);

export type Workspace = typeof workspace.$inferSelect;
export type NewWorkspace = typeof workspace.$inferInsert;
export type WorkspaceMember = typeof workspaceMember.$inferSelect;
export type NewWorkspaceMember = typeof workspaceMember.$inferInsert;
