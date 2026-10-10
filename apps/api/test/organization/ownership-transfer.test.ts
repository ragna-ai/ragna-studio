import { db } from '@repo/database';
import { seedAuthenticatedUser, seedOrganizationMember, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import { activeOrganizationId } from './invitation-fixtures';
import { memberIdOf, organizationRequest } from './member-fixtures';

beforeEach(async () => {
  await truncateAllTables();
});

async function roleOf(userId: string): Promise<string | undefined> {
  return (await db.query.organizationMember.findFirst({ where: { userId } }))?.role;
}

async function seedOwnerWithColleague(role: string) {
  const owner = await seedAuthenticatedUser();
  const organizationId = await activeOrganizationId(owner.cookieHeader);
  const colleague = await seedOrganizationMember({ organizationId, role });
  return { owner, colleague };
}

describe('POST /organization/transfer-ownership', () => {
  test('swaps the owner and the target roles', async () => {
    const { owner, colleague } = await seedOwnerWithColleague('member');

    const response = await organizationRequest(owner.cookieHeader, 'POST', '/transfer-ownership', {
      memberId: await memberIdOf(colleague.userId),
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(await roleOf(colleague.userId)).toBe('owner');
    expect(await roleOf(owner.userId)).toBe('admin');
  });

  test('the former owner can no longer transfer', async () => {
    const { owner, colleague } = await seedOwnerWithColleague('admin');
    await organizationRequest(owner.cookieHeader, 'POST', '/transfer-ownership', {
      memberId: await memberIdOf(colleague.userId),
    });

    const response = await organizationRequest(owner.cookieHeader, 'POST', '/transfer-ownership', {
      memberId: await memberIdOf(owner.userId),
    });

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(await roleOf(colleague.userId)).toBe('owner');
  });

  test.each(['admin', 'member'])('a non-owner (%s) gets 403', async (role) => {
    const { owner, colleague } = await seedOwnerWithColleague(role);

    const response = await organizationRequest(
      colleague.cookieHeader,
      'POST',
      '/transfer-ownership',
      {
        memberId: await memberIdOf(colleague.userId),
      },
    );

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(await roleOf(owner.userId)).toBe('owner');
  });

  test('rejects a removed member as the target', async () => {
    const { owner, colleague } = await seedOwnerWithColleague('member');
    const memberId = await memberIdOf(colleague.userId);
    await organizationRequest(owner.cookieHeader, 'DELETE', `/members/${memberId}`);

    const response = await organizationRequest(owner.cookieHeader, 'POST', '/transfer-ownership', {
      memberId,
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await roleOf(owner.userId)).toBe('owner');
  });

  test('rejects the owner as their own target', async () => {
    const { owner } = await seedOwnerWithColleague('member');

    const response = await organizationRequest(owner.cookieHeader, 'POST', '/transfer-ownership', {
      memberId: await memberIdOf(owner.userId),
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });

  test('a member of another organization is not found', async () => {
    const { owner } = await seedOwnerWithColleague('member');
    const stranger = await seedAuthenticatedUser();

    const response = await organizationRequest(owner.cookieHeader, 'POST', '/transfer-ownership', {
      memberId: await memberIdOf(stranger.userId),
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(await roleOf(stranger.userId)).toBe('owner');
  });
});
