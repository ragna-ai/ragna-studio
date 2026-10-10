import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, PERSONAL_WORKSPACE_NAME, sql } from '@repo/database';
import { WORKSPACE_VISIBILITY_PERSONAL } from '@repo/database/schema';
import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';

const BACKFILL_SQL = readFileSync(
  join(
    import.meta.dir,
    '../../../../packages/database/drizzle/20261010090326_private_workspace_backfill/migration.sql',
  ),
  'utf8',
);

beforeEach(async () => {
  await truncateAllTables();
});

async function seedUserWithoutPersonalWorkspace() {
  const seeded = await seedAuthenticatedUser();
  await db.execute(sql`DELETE FROM workspaces WHERE id = ${seeded.personalWorkspaceId}`);
  return seeded;
}

async function runBackfill() {
  await db.execute(sql.raw(BACKFILL_SQL));
}

async function listPersonalWorkspaces() {
  return db.query.workspace.findMany({ where: { visibility: WORKSPACE_VISIBILITY_PERSONAL } });
}

describe('private workspace backfill', () => {
  test('gives every user exactly one private workspace in their own org', async () => {
    const hasOne = await seedAuthenticatedUser();
    const missing = await seedUserWithoutPersonalWorkspace();
    const softDeletedUser = await seedUserWithoutPersonalWorkspace();
    await db.execute(sql`UPDATE users SET deleted_at = now() WHERE id = ${softDeletedUser.userId}`);
    const inDeletedOrg = await seedUserWithoutPersonalWorkspace();
    const membership = await db.query.organizationMember.findFirst({
      where: { userId: inDeletedOrg.userId },
    });
    await db.execute(
      sql`UPDATE organizations SET deleted_at = now() WHERE id = ${membership?.organizationId ?? ''}`,
    );

    await runBackfill();

    const personal = await listPersonalWorkspaces();
    const userIds = [hasOne, missing, softDeletedUser, inDeletedOrg].map((s) => s.userId);
    expect(personal.map((w) => w.personalUserId).sort()).toEqual([...userIds].sort());
    for (const userId of userIds) {
      const memberships = await db.query.organizationMember.findMany({ where: { userId } });
      const own = personal.filter((w) => w.personalUserId === userId);
      expect(own).toHaveLength(1);
      expect(own[0]?.organizationId).toBe(memberships[0]?.organizationId);
      expect(own[0]?.name).toBe(PERSONAL_WORKSPACE_NAME);
      expect(own[0]?.visibility).toBe(WORKSPACE_VISIBILITY_PERSONAL);
    }
  });

  test('leaves an existing private workspace untouched', async () => {
    const hasOne = await seedAuthenticatedUser();

    await runBackfill();

    const personal = await listPersonalWorkspaces();
    expect(personal.map((w) => w.id)).toEqual([hasOne.personalWorkspaceId]);
  });

  test('changes nothing when run a second time', async () => {
    await seedUserWithoutPersonalWorkspace();
    await runBackfill();
    const afterFirstRun = await listPersonalWorkspaces();

    await runBackfill();

    const afterSecondRun = await listPersonalWorkspaces();
    expect(afterSecondRun).toEqual(afterFirstRun);
  });
});
