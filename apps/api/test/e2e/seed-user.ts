import { getOrganizationIdByUserId } from '@repo/database';
import {
  seedAuthenticatedUser,
  seedOrganizationMember,
  seedCreditAccount,
  seedTokenPricedAiModel,
  truncateAllTables,
} from '@repo/testing';

interface SeedResult {
  cookieHeader: string;
  workspaceId: string;
  memberCookieHeader: string;
  memberWorkspaceId: string;
}

/**
 * Resets the test database and seeds one signed-in user with a language
 * model and a funded credit account, plus an organization member without
 * a management role. Prints the result.
 */
async function seed(): Promise<SeedResult> {
  await truncateAllTables();
  const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
  await seedTokenPricedAiModel({ displayName: 'E2E Model' });
  await seedCreditAccount({ userId, balanceMicroCredits: 5_000_000n });
  const organizationId = await getOrganizationIdByUserId({ userId });
  if (!organizationId) throw new Error('Seeded user has no organization.');
  const member = await seedOrganizationMember({ organizationId, role: 'member' });
  return {
    cookieHeader,
    workspaceId,
    memberCookieHeader: member.cookieHeader,
    memberWorkspaceId: member.workspaceId,
  };
}

const result = await seed();
console.log(JSON.stringify(result));
process.exit(0);
