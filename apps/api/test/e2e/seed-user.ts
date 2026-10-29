import {
  seedAuthenticatedUser,
  seedCreditAccount,
  seedTokenPricedAiModel,
  truncateAllTables,
} from '@repo/testing';

interface SeedResult {
  cookieHeader: string;
  workspaceId: string;
}

/**
 * Resets the test database and seeds one signed-in user with a language
 * model and a funded credit account. Prints the result as the last stdout line.
 */
async function seed(): Promise<SeedResult> {
  await truncateAllTables();
  const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
  await seedTokenPricedAiModel({ displayName: 'E2E Model' });
  await seedCreditAccount({ userId, balanceMicroCredits: 5_000_000n });
  return { cookieHeader, workspaceId };
}

const result = await seed();
console.log(JSON.stringify(result));
process.exit(0);
