import {
  deleteSeededUser,
  seedAuthenticatedUser,
  seedCreditAccount,
  seedOrganizationMember,
  seedTokenPricedAiModel,
  settleTestUsage,
  truncateAllTables,
  type SeededAuthenticatedUser,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { activeOrganizationId } from './invitation-fixtures';
import { organizationRequest } from './member-fixtures';

const MICRO_CREDITS_PER_CREDIT = 1_000_000;

const usageBodySchema = z.strictObject({
  members: z.array(
    z.strictObject({
      userId: z.string().nullable(),
      name: z.string().nullable(),
      eventCount: z.number(),
      credits: z.number(),
    }),
  ),
});

beforeEach(async () => {
  await truncateAllTables();
});

async function chargeOnce(
  user: SeededAuthenticatedUser,
  creditAccountId: string,
  aiModelId: string,
) {
  const settlement = await settleTestUsage({
    creditAccountId,
    workspaceId: user.workspaceId,
    userId: user.userId,
    aiModelId,
  });
  return Number(settlement?.chargedMicroCredits ?? 0n) / MICRO_CREDITS_PER_CREDIT;
}

describe('GET /organization/usage', () => {
  test('groups credit usage per member in one list', async () => {
    const owner = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(owner.cookieHeader);
    const colleague = await seedOrganizationMember({ organizationId, role: 'member' });
    const { creditAccountId } = await seedCreditAccount({
      userId: owner.userId,
      balanceMicroCredits: 100_000_000n,
    });
    const { aiModelId } = await seedTokenPricedAiModel();
    let ownerCredits = 0;
    for (let charge = 0; charge < 3; charge++) {
      ownerCredits += await chargeOnce(owner, creditAccountId, aiModelId);
    }
    const colleagueCredits = await chargeOnce(colleague, creditAccountId, aiModelId);

    const response = await organizationRequest(owner.cookieHeader, 'GET', '/usage');

    expect(response.status).toBe(StatusCodes.OK);
    const { members } = usageBodySchema.parse(await response.json());
    expect(members).toHaveLength(2);
    const byUser = new Map(members.map((row) => [row.userId, row]));
    expect(byUser.get(owner.userId)?.eventCount).toBe(3);
    expect(byUser.get(owner.userId)?.credits).toBeCloseTo(ownerCredits, 6);
    expect(byUser.get(colleague.userId)?.eventCount).toBe(1);
    expect(byUser.get(colleague.userId)?.credits).toBeCloseTo(colleagueCredits, 6);
    expect(byUser.get(colleague.userId)?.name).toBeString();
  });

  test('shows a hard-deleted member as a null user', async () => {
    const owner = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(owner.cookieHeader);
    const colleague = await seedOrganizationMember({ organizationId, role: 'member' });
    const { creditAccountId } = await seedCreditAccount({
      userId: owner.userId,
      balanceMicroCredits: 100_000_000n,
    });
    const { aiModelId } = await seedTokenPricedAiModel();
    await chargeOnce(colleague, creditAccountId, aiModelId);
    await deleteSeededUser({ userId: colleague.userId });

    const response = await organizationRequest(owner.cookieHeader, 'GET', '/usage');

    const { members } = usageBodySchema.parse(await response.json());
    expect(members).toEqual([
      { userId: null, name: null, eventCount: 1, credits: expect.any(Number) },
    ]);
  });

  test('admins may read it, plain members may not', async () => {
    const owner = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(owner.cookieHeader);
    const admin = await seedOrganizationMember({ organizationId, role: 'admin' });
    const plainMember = await seedOrganizationMember({ organizationId, role: 'member' });

    const asAdmin = await organizationRequest(admin.cookieHeader, 'GET', '/usage');
    const asMember = await organizationRequest(plainMember.cookieHeader, 'GET', '/usage');

    expect(asAdmin.status).toBe(StatusCodes.OK);
    expect(asMember.status).toBe(StatusCodes.FORBIDDEN);
  });

  test('is empty without a credit account', async () => {
    const owner = await seedAuthenticatedUser();

    const response = await organizationRequest(owner.cookieHeader, 'GET', '/usage');

    expect(usageBodySchema.parse(await response.json()).members).toEqual([]);
  });
});
