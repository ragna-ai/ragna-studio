import { createEmailAccount, db, listEmailAccountsDueForSync } from '@repo/database';
import { member, oauthConsent, oauthRefreshToken } from '@repo/database/schema';
import { seedAuthenticatedUser, seedOrganizationMember, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import {
  seedMcpConnection,
  seedOAuthClient,
  TEST_MCP_CLIENT_ID,
} from '../mcp/support/mcp-fixtures';
import { activeOrganizationId } from './invitation-fixtures';
import {
  markUserBanned,
  memberIdOf,
  organizationRequest,
  startSessionFor,
} from './member-fixtures';

const organizationBodySchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  deletedAt: z.null(),
});

const errorBodySchema = z.object({ message: z.string() });
const apiErrorBodySchema = z.strictObject({ code: z.number(), error: z.string() });

beforeEach(async () => {
  await truncateAllTables();
});

async function seedOrganizationWith(roles: string[]) {
  const owner = await seedAuthenticatedUser();
  const organizationId = await activeOrganizationId(owner.cookieHeader);
  const colleagues = [];
  for (const role of roles) {
    colleagues.push(await seedOrganizationMember({ organizationId, role }));
  }
  return { owner, organizationId, colleagues };
}

describe('GET /organization', () => {
  test('returns the organization and the caller role', async () => {
    const { owner, organizationId, colleagues } = await seedOrganizationWith(['admin']);

    const ownerResponse = await organizationRequest(owner.cookieHeader, 'GET', '');
    const adminResponse = await organizationRequest(colleagues[0]?.cookieHeader ?? '', 'GET', '');

    expect(ownerResponse.status).toBe(StatusCodes.OK);
    expect(organizationBodySchema.parse(await ownerResponse.json())).toMatchObject({
      id: organizationId,
      role: 'owner',
    });
    expect(organizationBodySchema.parse(await adminResponse.json()).role).toBe('admin');
  });

  test('requires a session', async () => {
    const response = await organizationRequest('', 'GET', '');
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });
});

describe('removing a member', () => {
  test('soft-deletes the account, ends sessions and revokes MCP access', async () => {
    const { owner, colleagues } = await seedOrganizationWith(['member']);
    const target = colleagues[0];
    if (!target) throw new Error('missing colleague');
    await seedOAuthClient();
    await seedMcpConnection({
      userId: target.userId,
      workspaceId: target.workspaceId,
      access: { datasets: 'read' },
    });
    await db.insert(oauthRefreshToken).values({
      token: 'refresh-token',
      clientId: TEST_MCP_CLIENT_ID,
      userId: target.userId,
      expiresAt: new Date(Date.now() + 3_600_000),
      createdAt: new Date(),
      scopes: ['mcp'],
    });
    await db.insert(oauthConsent).values({
      clientId: TEST_MCP_CLIENT_ID,
      userId: target.userId,
      scopes: ['mcp'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const memberId = await memberIdOf(target.userId);

    const response = await organizationRequest(
      owner.cookieHeader,
      'DELETE',
      `/members/${memberId}`,
    );

    expect(response.status).toBe(StatusCodes.OK);
    const user = await db.query.user.findFirst({ where: { id: target.userId } });
    expect(user?.deletedAt).toBeInstanceOf(Date);
    expect(user?.banned).toBe(true);
    expect(user?.banReason).toBe('member_removed');
    expect(await db.query.session.findMany({ where: { userId: target.userId } })).toHaveLength(0);
    expect(
      await db.query.mcpConnection.findMany({ where: { userId: target.userId } }),
    ).toHaveLength(0);
    expect(
      await db.query.oauthRefreshToken.findMany({ where: { userId: target.userId } }),
    ).toHaveLength(0);
    expect(await db.query.oauthConsent.findMany({ where: { userId: target.userId } })).toHaveLength(
      0,
    );
    expect(await db.query.member.findFirst({ where: { id: memberId } })).toBeDefined();
    const afterwards = await organizationRequest(target.cookieHeader, 'GET', '');
    expect(afterwards.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  test('a removed member cannot start a new session', async () => {
    const { owner, colleagues } = await seedOrganizationWith(['member']);
    const target = colleagues[0];
    if (!target) throw new Error('missing colleague');

    await organizationRequest(
      owner.cookieHeader,
      'DELETE',
      `/members/${await memberIdOf(target.userId)}`,
    );

    const signIn = await startSessionFor(target.userId);
    expect(signIn.status).toBe(StatusCodes.FORBIDDEN);
    expect(errorBodySchema.parse(await signIn.json()).message).toBe(
      'You were removed from your organization.',
    );
  });

  test('an admin can remove a member', async () => {
    const { colleagues } = await seedOrganizationWith(['admin', 'member']);
    const [admin, target] = colleagues;
    if (!admin || !target) throw new Error('missing colleagues');

    const response = await organizationRequest(
      admin.cookieHeader,
      'DELETE',
      `/members/${await memberIdOf(target.userId)}`,
    );

    expect(response.status).toBe(StatusCodes.OK);
  });

  test('a plain member cannot remove anyone', async () => {
    const { colleagues } = await seedOrganizationWith(['member', 'member']);
    const [caller, target] = colleagues;
    if (!caller || !target) throw new Error('missing colleagues');

    const response = await organizationRequest(
      caller.cookieHeader,
      'DELETE',
      `/members/${await memberIdOf(target.userId)}`,
    );

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    const user = await db.query.user.findFirst({ where: { id: target.userId } });
    expect(user?.deletedAt).toBeNull();
  });

  test('nobody can remove the owner', async () => {
    const { owner, colleagues } = await seedOrganizationWith(['admin']);
    const admin = colleagues[0];
    if (!admin) throw new Error('missing admin');
    const ownerMemberId = await memberIdOf(owner.userId);

    const byAdmin = await organizationRequest(
      admin.cookieHeader,
      'DELETE',
      `/members/${ownerMemberId}`,
    );
    const byOwner = await organizationRequest(
      owner.cookieHeader,
      'DELETE',
      `/members/${ownerMemberId}`,
    );

    expect(byAdmin.status).toBe(StatusCodes.FORBIDDEN);
    expect(byOwner.status).toBe(StatusCodes.FORBIDDEN);
    const user = await db.query.user.findFirst({ where: { id: owner.userId } });
    expect(user?.deletedAt).toBeNull();
  });

  test('a member of another organization is not found', async () => {
    const { owner } = await seedOrganizationWith([]);
    const stranger = await seedAuthenticatedUser();

    const response = await organizationRequest(
      owner.cookieHeader,
      'DELETE',
      `/members/${await memberIdOf(stranger.userId)}`,
    );

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    const user = await db.query.user.findFirst({ where: { id: stranger.userId } });
    expect(user?.deletedAt).toBeNull();
  });
});

describe('restoring a member', () => {
  test('re-enables sign-in and clears the removal fields', async () => {
    const { owner, colleagues } = await seedOrganizationWith(['member']);
    const target = colleagues[0];
    if (!target) throw new Error('missing colleague');
    const memberId = await memberIdOf(target.userId);
    await organizationRequest(owner.cookieHeader, 'DELETE', `/members/${memberId}`);

    const response = await organizationRequest(
      owner.cookieHeader,
      'POST',
      `/members/${memberId}/restore`,
    );

    expect(response.status).toBe(StatusCodes.OK);
    const user = await db.query.user.findFirst({ where: { id: target.userId } });
    expect(user?.deletedAt).toBeNull();
    expect(user?.banned).toBe(false);
    expect(user?.banReason).toBeNull();
    expect((await startSessionFor(target.userId)).status).toBe(StatusCodes.OK);
  });

  test('only works for removed members of the own organization', async () => {
    const { owner, colleagues } = await seedOrganizationWith(['member']);
    const target = colleagues[0];
    if (!target) throw new Error('missing colleague');
    const stranger = await seedAuthenticatedUser();

    const active = await organizationRequest(
      owner.cookieHeader,
      'POST',
      `/members/${await memberIdOf(target.userId)}/restore`,
    );
    const foreign = await organizationRequest(
      owner.cookieHeader,
      'POST',
      `/members/${await memberIdOf(stranger.userId)}/restore`,
    );

    expect(active.status).toBe(StatusCodes.NOT_FOUND);
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('a plain member cannot restore', async () => {
    const { owner, colleagues } = await seedOrganizationWith(['member', 'member']);
    const [caller, target] = colleagues;
    if (!caller || !target) throw new Error('missing colleagues');
    const memberId = await memberIdOf(target.userId);
    await organizationRequest(owner.cookieHeader, 'DELETE', `/members/${memberId}`);

    const response = await organizationRequest(
      caller.cookieHeader,
      'POST',
      `/members/${memberId}/restore`,
    );

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
  });
});

describe('leaving the organization', () => {
  test.each(['member', 'admin'])('a %s leaves and is soft-deleted', async (role) => {
    const { colleagues } = await seedOrganizationWith([role]);
    const leaver = colleagues[0];
    if (!leaver) throw new Error('missing colleague');

    const response = await organizationRequest(leaver.cookieHeader, 'POST', '/leave');

    expect(response.status).toBe(StatusCodes.OK);
    const user = await db.query.user.findFirst({ where: { id: leaver.userId } });
    expect(user?.banReason).toBe('member_removed');
    expect(user?.deletedAt).toBeInstanceOf(Date);
    expect(await db.query.session.findMany({ where: { userId: leaver.userId } })).toHaveLength(0);
  });

  test('the owner cannot leave', async () => {
    const { owner } = await seedOrganizationWith([]);

    const response = await organizationRequest(owner.cookieHeader, 'POST', '/leave');

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(apiErrorBodySchema.parse(await response.json()).error).toContain(
      'Transfer ownership or delete the organization',
    );
    const user = await db.query.user.findFirst({ where: { id: owner.userId } });
    expect(user?.deletedAt).toBeNull();
  });
});

describe('ban messages', () => {
  test('a platform ban keeps the default message', async () => {
    const { colleagues } = await seedOrganizationWith(['member']);
    const banned = colleagues[0];
    if (!banned) throw new Error('missing colleague');
    await markUserBanned(banned.userId, 'spam');

    const signIn = await startSessionFor(banned.userId);
    expect(signIn.status).toBe(StatusCodes.FORBIDDEN);
    expect(errorBodySchema.parse(await signIn.json()).message).toBe(
      'You have been banned from this application. Please contact support if you believe this is an error.',
    );
  });

  test('a deleted organization has its own message', async () => {
    const { colleagues } = await seedOrganizationWith(['member']);
    const banned = colleagues[0];
    if (!banned) throw new Error('missing colleague');
    await markUserBanned(banned.userId, 'organization_deleted');

    const signIn = await startSessionFor(banned.userId);
    expect(signIn.status).toBe(StatusCodes.FORBIDDEN);
    expect(errorBodySchema.parse(await signIn.json()).message).toBe(
      'Your organization is scheduled for deletion.',
    );
  });
});

describe('email sync', () => {
  test('skips the accounts of removed members', async () => {
    const { owner, colleagues } = await seedOrganizationWith(['member']);
    const target = colleagues[0];
    if (!target) throw new Error('missing colleague');
    for (const { userId } of [owner, target]) {
      await createEmailAccount({ userId, provider: 'gmail', email: `${userId}@example.com` });
    }

    await organizationRequest(
      owner.cookieHeader,
      'DELETE',
      `/members/${await memberIdOf(target.userId)}`,
    );

    const due = await listEmailAccountsDueForSync();
    expect(due.map((account) => account.userId)).toEqual([owner.userId]);
  });
});

describe('one membership per user', () => {
  test('the database rejects a second membership', async () => {
    const { owner } = await seedOrganizationWith([]);
    const otherOrganization = await seedAuthenticatedUser();
    const otherOrganizationId = await activeOrganizationId(otherOrganization.cookieHeader);

    const insertSecondMembership = async () =>
      db.insert(member).values({
        organizationId: otherOrganizationId,
        userId: owner.userId,
        role: 'member',
        createdAt: new Date(),
      });

    await expect(insertSecondMembership()).rejects.toThrow();
  });
});
