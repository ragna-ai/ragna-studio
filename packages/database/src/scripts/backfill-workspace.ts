// One-off backfill for the workspace-container migration (docs/api-standards/prd.md).
//
// Run this BEFORE the `workspace_id` columns go NOT NULL:
//   1. Every user without a workspace gets one named "Personal".
//   2. Every row with workspace_id IS NULL on the six scoped tables is
//      assigned to its owner's first workspace.
//
// Usage: pnpm --filter @repo/database db:backfill-workspace

import { sql } from 'drizzle-orm';
import { db } from '../db';
import { createWorkspace, getAllWorkspacesByOwnerId } from '../repositories/workspace.repo';

// Every table here has a nullable `user_id` (authorship) and `workspace_id`
// column, both named consistently.
const scopedTables = ['agents', 'chats', 'gen_images', 'social_posts', 'workflows', 'datasets'];

async function createMissingPersonalWorkspaces(): Promise<void> {
  const users = await db.query.user.findMany({ columns: { id: true } });

  let created = 0;
  for (const { id: ownerId } of users) {
    const existing = await getAllWorkspacesByOwnerId({ ownerId });
    if (existing.length > 0) {
      continue;
    }
    await createWorkspace({ ownerId, name: 'Personal' });
    created += 1;
  }

  console.log(`Created ${created} "Personal" workspace(s) for user(s) without one.`);
}

// `agents` has a partial unique index on (user_id, workspace_id) where
// is_default is true (one default agent per workspace). A row that was the
// user's unassigned default can collide with a default agent already sitting
// in the target workspace, so the move also demotes is_default in that case.
// No other scoped table has a constraint like this.
const isDefaultDemoteClause = sql`,
      is_default = t.is_default AND NOT EXISTS (
        SELECT 1 FROM agents existing
        WHERE existing.workspace_id = first_workspace.id
          AND existing.user_id = t.user_id
          AND existing.is_default = true
          AND existing.id <> t.id
      )`;

// Assigns every row with a NULL workspace_id to its owner's first workspace
// (oldest by created_at). Rows whose user_id has no matching user (or is
// itself NULL) are left untouched and reported separately.
async function backfillTable(table: string): Promise<void> {
  const updated = await db.execute(sql`
    UPDATE ${sql.identifier(table)} AS t
    SET workspace_id = first_workspace.id${table === 'agents' ? isDefaultDemoteClause : sql``}
    FROM (
      SELECT DISTINCT ON (owner_id) id, owner_id
      FROM workspaces
      ORDER BY owner_id, created_at ASC
    ) AS first_workspace
    WHERE t.workspace_id IS NULL
      AND t.user_id = first_workspace.owner_id
  `);

  const [{ orphaned }] = (
    await db.execute(sql`
      SELECT count(*)::int AS orphaned
      FROM ${sql.identifier(table)}
      WHERE workspace_id IS NULL
    `)
  ).rows as { orphaned: number }[];

  console.log(`${table}: updated ${updated.rowCount ?? 0} row(s), ${orphaned} still unassigned.`);

  if (orphaned > 0) {
    console.warn(
      `  ${table} has ${orphaned} row(s) with no user_id (or an owner with no workspace). ` +
        'These need manual attention before the NOT NULL migration.',
    );
  }
}

async function main() {
  await createMissingPersonalWorkspaces();

  for (const table of scopedTables) {
    await backfillTable(table);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
