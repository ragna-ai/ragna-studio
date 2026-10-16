import { getEmailAccountByUserId } from '@repo/database';
import { seedAuthenticatedUser, seedOrganizationMember, truncateAllTables } from '@repo/testing';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import { activeOrganizationId } from './invitation-fixtures';
import { memberIdOf, organizationRequest } from './member-fixtures';
import { seedConnectedGmailAccount } from '../email/support/email-fixtures';
import { resetEmailQueueMock } from '../email/support/email-queue.mock';
import {
  fillProviderTokens,
  loadProviderAccount,
  mockGoogleRevoke,
  type GoogleRevokeMock,
} from '../email/support/provider-grant-fixtures';

let revokeMock: GoogleRevokeMock;

beforeEach(async () => {
  await truncateAllTables();
  resetEmailQueueMock();
  revokeMock = mockGoogleRevoke();
});

afterEach(() => {
  revokeMock.restore();
});

async function seedOwnerWithConnectedMember() {
  const owner = await seedAuthenticatedUser();
  const organizationId = await activeOrganizationId(owner.cookieHeader);
  await seedConnectedGmailAccount({ userId: owner.userId, cookieHeader: owner.cookieHeader });
  const member = await seedOrganizationMember({ organizationId, role: 'member' });
  await seedConnectedGmailAccount({ userId: member.userId, cookieHeader: member.cookieHeader });
  await fillProviderTokens({ userId: member.userId, providerId: 'google' });
  return { owner, member };
}

describe('mail tokens on offboarding', () => {
  test('removing a member revokes and clears only that member', async () => {
    const { owner, member } = await seedOwnerWithConnectedMember();
    const memberBefore = await loadProviderAccount({
      userId: member.userId,
      providerId: 'google',
    });

    const response = await organizationRequest(
      owner.cookieHeader,
      'DELETE',
      `/members/${await memberIdOf(member.userId)}`,
    );

    expect(response.status).toBe(StatusCodes.OK);
    expect(revokeMock.revokedTokens()).toEqual([memberBefore?.accessToken ?? 'missing']);
    const memberAfter = await loadProviderAccount({ userId: member.userId, providerId: 'google' });
    expect(memberAfter).toMatchObject({ accessToken: null, refreshToken: null, scope: null });
    expect(await getEmailAccountByUserId({ userId: member.userId })).toBeNull();

    const ownerAfter = await loadProviderAccount({ userId: owner.userId, providerId: 'google' });
    expect(ownerAfter?.accessToken).not.toBeNull();
    expect(await getEmailAccountByUserId({ userId: owner.userId })).not.toBeNull();
  });

  test('leaving revokes and clears the leaver tokens', async () => {
    const { member } = await seedOwnerWithConnectedMember();

    const response = await organizationRequest(member.cookieHeader, 'POST', '/leave');

    expect(response.status).toBe(StatusCodes.OK);
    expect(revokeMock.revokedTokens()).toHaveLength(1);
    const after = await loadProviderAccount({ userId: member.userId, providerId: 'google' });
    expect(after?.accessToken).toBeNull();
    expect(await getEmailAccountByUserId({ userId: member.userId })).toBeNull();
  });

  test('removing a member without a mailbox still succeeds', async () => {
    const owner = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(owner.cookieHeader);
    const member = await seedOrganizationMember({ organizationId, role: 'member' });

    const response = await organizationRequest(
      owner.cookieHeader,
      'DELETE',
      `/members/${await memberIdOf(member.userId)}`,
    );

    expect(response.status).toBe(StatusCodes.OK);
    expect(revokeMock.revokedTokens()).toHaveLength(0);
  });
});
