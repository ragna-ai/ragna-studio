import { getEmailAccountByUserId, listUserConnections } from '@repo/database';
import {
  providerHttp,
  resetProviderMocks,
  seedAuthenticatedUser,
  seedOrganizationMember,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import { seedConnectedGmailAccount } from '../email/support/email-fixtures';
import { resetEmailQueueMock } from '../email/support/email-queue.mock';
import { activeOrganizationId } from './invitation-fixtures';
import { memberIdOf, organizationRequest } from './member-fixtures';

beforeEach(async () => {
  await truncateAllTables();
  resetProviderMocks();
  resetEmailQueueMock();
});

async function seedOwnerWithConnectedMember() {
  const owner = await seedAuthenticatedUser();
  const organizationId = await activeOrganizationId(owner.cookieHeader);
  await seedConnectedGmailAccount({ userId: owner.userId, cookieHeader: owner.cookieHeader });
  const member = await seedOrganizationMember({ organizationId, role: 'member' });
  const memberMailbox = await seedConnectedGmailAccount({
    userId: member.userId,
    cookieHeader: member.cookieHeader,
  });
  return { owner, member, memberMailbox };
}

describe('connections on offboarding', () => {
  test('removing a member revokes and deletes only that member connections', async () => {
    const { owner, member } = await seedOwnerWithConnectedMember();

    const response = await organizationRequest(
      owner.cookieHeader,
      'DELETE',
      `/members/${await memberIdOf(member.userId)}`,
    );

    expect(response.status).toBe(StatusCodes.OK);
    expect(providerHttp.revokeRequests).toHaveLength(1);
    expect(await listUserConnections({ userId: member.userId })).toHaveLength(0);
    expect(await getEmailAccountByUserId({ userId: member.userId })).toBeNull();
    expect(await listUserConnections({ userId: owner.userId })).toHaveLength(1);
    expect(await getEmailAccountByUserId({ userId: owner.userId })).not.toBeNull();
  });

  test('leaving revokes and deletes the leaver connections', async () => {
    const { member } = await seedOwnerWithConnectedMember();

    const response = await organizationRequest(member.cookieHeader, 'POST', '/leave');

    expect(response.status).toBe(StatusCodes.OK);
    expect(providerHttp.revokeRequests).toHaveLength(1);
    expect(await listUserConnections({ userId: member.userId })).toHaveLength(0);
    expect(await getEmailAccountByUserId({ userId: member.userId })).toBeNull();
  });

  test('removing a member without a connection still succeeds', async () => {
    const owner = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(owner.cookieHeader);
    const member = await seedOrganizationMember({ organizationId, role: 'member' });

    const response = await organizationRequest(
      owner.cookieHeader,
      'DELETE',
      `/members/${await memberIdOf(member.userId)}`,
    );

    expect(response.status).toBe(StatusCodes.OK);
    expect(providerHttp.revokeRequests).toHaveLength(0);
  });
});
