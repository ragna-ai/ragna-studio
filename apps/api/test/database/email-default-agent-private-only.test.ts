import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, sql } from '@repo/database';
import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import {
  createAgentForWorkspace,
  seedConnectedGmailAccount,
} from '../email/support/email-fixtures';

const MIGRATIONS_DIR = join(import.meta.dir, '../../../../packages/database/drizzle');
const MIGRATION_FOLDER = readdirSync(MIGRATIONS_DIR).find((name) =>
  name.endsWith('_email_default_agent_private_only'),
);
const MIGRATION_SQL = readFileSync(
  join(MIGRATIONS_DIR, MIGRATION_FOLDER ?? '', 'migration.sql'),
  'utf8',
);

beforeEach(async () => {
  await truncateAllTables();
});

async function seedAccountWithDefaultAgent(workspaceOf: 'private' | 'shared') {
  const user = await seedAuthenticatedUser();
  const { accountId } = await seedConnectedGmailAccount({
    userId: user.userId,
    cookieHeader: user.cookieHeader,
  });
  const workspaceId = workspaceOf === 'private' ? user.personalWorkspaceId : user.workspaceId;
  const agentId = await createAgentForWorkspace(user.cookieHeader, workspaceId);
  await db.execute(
    sql`UPDATE email_accounts SET default_agent_id = ${agentId} WHERE id = ${accountId}`,
  );
  return { accountId, agentId };
}

async function readDefaultAgentId(accountId: string) {
  const account = await db.query.emailAccount.findFirst({ where: { id: accountId } });
  return account?.defaultAgentId ?? null;
}

async function runMigration() {
  await db.execute(sql.raw(MIGRATION_SQL));
}

describe('email default agent private only', () => {
  test('nulls a default agent outside the private workspace', async () => {
    const stale = await seedAccountWithDefaultAgent('shared');

    await runMigration();

    expect(await readDefaultAgentId(stale.accountId)).toBeNull();
  });

  test('keeps a default agent in the private workspace', async () => {
    const valid = await seedAccountWithDefaultAgent('private');

    await runMigration();

    expect(await readDefaultAgentId(valid.accountId)).toBe(valid.agentId);
  });

  test('changes nothing when run a second time', async () => {
    const stale = await seedAccountWithDefaultAgent('shared');
    const valid = await seedAccountWithDefaultAgent('private');
    await runMigration();

    await runMigration();

    expect(await readDefaultAgentId(stale.accountId)).toBeNull();
    expect(await readDefaultAgentId(valid.accountId)).toBe(valid.agentId);
  });
});
