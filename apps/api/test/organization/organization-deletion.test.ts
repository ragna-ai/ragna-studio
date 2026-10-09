import {
  createEmailAccount,
  db,
  isWorkflowOrganizationDeleted,
  listEmailAccountsDueForSync,
  listTasksDueForReminder,
  sql,
} from '@repo/database';
import { invitation, workflow } from '@repo/database/schema';
import { seedAuthenticatedUser, seedOrganizationMember, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { seedMcpConnection, seedOAuthClient } from '../mcp/support/mcp-fixtures';
import { activeOrganizationId, insertInvitation } from './invitation-fixtures';
import { memberIdOf, organizationRequest, startSessionFor } from './member-fixtures';

const organizationBodySchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  deletedAt: z.string().nullable(),
});
const organizationDeletedBodySchema = z.strictObject({
  code: z.literal('ORGANIZATION_DELETED'),
  error: z.string(),
});
const successBodySchema = z.strictObject({ success: z.literal(true) });
const signInErrorSchema = z.object({ message: z.string() });

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

async function deleteOrganization(cookieHeader: string) {
  return organizationRequest(cookieHeader, 'DELETE', '');
}

function getRoute(cookieHeader: string, path: string) {
  return app.request(path, { headers: { cookie: cookieHeader } });
}

async function expectOrganizationDeleted(response: Response) {
  expect(response.status).toBe(StatusCodes.FORBIDDEN);
  organizationDeletedBodySchema.parse(await response.json());
}

describe('DELETE /organization', () => {
  test('soft-deletes the organization and bans every other member', async () => {
    const { owner, organizationId, colleagues } = await seedOrganizationWith(['admin', 'member']);

    const response = await deleteOrganization(owner.cookieHeader);

    expect(response.status).toBe(StatusCodes.OK);
    successBodySchema.parse(await response.json());
    const row = await db.query.organization.findFirst({ where: { id: organizationId } });
    expect(row?.deletedAt).toBeInstanceOf(Date);
    for (const colleague of colleagues) {
      const colleagueRow = await db.query.user.findFirst({ where: { id: colleague.userId } });
      expect(colleagueRow).toMatchObject({ banned: true, banReason: 'organization_deleted' });
      expect(colleagueRow?.deletedAt).toBeInstanceOf(Date);
      expect(await db.query.session.findMany({ where: { userId: colleague.userId } })).toHaveLength(
        0,
      );
    }
  });

  test('keeps the owner able to sign in, and revokes every MCP connection', async () => {
    const { owner, colleagues } = await seedOrganizationWith(['member']);
    const member = colleagues[0];
    if (!member) throw new Error('missing colleague');
    await seedOAuthClient();
    await seedMcpConnection({
      userId: owner.userId,
      workspaceId: owner.workspaceId,
      access: { datasets: 'read' },
    });
    await seedMcpConnection({
      userId: member.userId,
      workspaceId: member.workspaceId,
      access: { datasets: 'read' },
    });

    await deleteOrganization(owner.cookieHeader);

    const ownerRow = await db.query.user.findFirst({ where: { id: owner.userId } });
    expect(ownerRow).toMatchObject({ banned: false, deletedAt: null });
    expect(await db.query.session.findMany({ where: { userId: owner.userId } })).not.toHaveLength(
      0,
    );
    expect(await db.query.mcpConnection.findMany()).toHaveLength(0);
  });

  test('cancels pending invitations', async () => {
    const { owner, organizationId } = await seedOrganizationWith([]);
    const invitationId = await insertInvitation({
      organizationId,
      inviterId: owner.userId,
      email: 'pending@example.com',
    });

    await deleteOrganization(owner.cookieHeader);

    const row = await db.query.invitation.findFirst({ where: { id: invitationId } });
    expect(row?.status).toBe('canceled');
  });

  test('leaves a member who was removed earlier with their own ban reason', async () => {
    const { owner, colleagues } = await seedOrganizationWith(['member']);
    const removed = colleagues[0];
    if (!removed) throw new Error('missing colleague');
    await organizationRequest(
      owner.cookieHeader,
      'DELETE',
      `/members/${await memberIdOf(removed.userId)}`,
    );

    await deleteOrganization(owner.cookieHeader);

    const row = await db.query.user.findFirst({ where: { id: removed.userId } });
    expect(row?.banReason).toBe('member_removed');
  });

  test.each(['admin', 'member'])('is forbidden for a %s', async (role) => {
    const { colleagues, organizationId } = await seedOrganizationWith([role]);

    const response = await deleteOrganization(colleagues[0]?.cookieHeader ?? '');

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    const row = await db.query.organization.findFirst({ where: { id: organizationId } });
    expect(row?.deletedAt).toBeNull();
  });
});

describe('while the organization is deleted', () => {
  test('the owner still reads GET /organization, with deletedAt', async () => {
    const { owner } = await seedOrganizationWith([]);
    await deleteOrganization(owner.cookieHeader);

    const response = await organizationRequest(owner.cookieHeader, 'GET', '');

    expect(response.status).toBe(StatusCodes.OK);
    const body = organizationBodySchema.parse(await response.json());
    expect(body.deletedAt).not.toBeNull();
  });

  test('an active organization reports deletedAt null', async () => {
    const { owner } = await seedOrganizationWith([]);

    const response = await organizationRequest(owner.cookieHeader, 'GET', '');

    expect(organizationBodySchema.parse(await response.json()).deletedAt).toBeNull();
  });

  test('workspace requests are rejected for the owner', async () => {
    const { owner } = await seedOrganizationWith([]);
    await deleteOrganization(owner.cookieHeader);

    const response = await getRoute(owner.cookieHeader, `/workspace/${owner.workspaceId}/task`);

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('the /workspace and /credit routes answer ORGANIZATION_DELETED', async () => {
    const { owner } = await seedOrganizationWith([]);
    await deleteOrganization(owner.cookieHeader);

    await expectOrganizationDeleted(await getRoute(owner.cookieHeader, '/workspace'));
    await expectOrganizationDeleted(await getRoute(owner.cookieHeader, '/credit/balance'));
    await expectOrganizationDeleted(await getRoute(owner.cookieHeader, '/credit/usage'));
  });

  test('every /organization route except GET and restore answers ORGANIZATION_DELETED', async () => {
    const { owner, colleagues } = await seedOrganizationWith(['member']);
    const memberId = await memberIdOf(colleagues[0]?.userId ?? '');
    await deleteOrganization(owner.cookieHeader);

    const responses = [
      await organizationRequest(owner.cookieHeader, 'GET', '/usage'),
      await organizationRequest(owner.cookieHeader, 'DELETE', ''),
      await organizationRequest(owner.cookieHeader, 'DELETE', `/members/${memberId}`),
      await organizationRequest(owner.cookieHeader, 'POST', `/members/${memberId}/restore`),
      await organizationRequest(owner.cookieHeader, 'POST', '/transfer-ownership', { memberId }),
    ];

    for (const response of responses) await expectOrganizationDeleted(response);
  });

  test('members cannot sign in, with the organization-deleted message', async () => {
    const { owner, colleagues } = await seedOrganizationWith(['member']);
    await deleteOrganization(owner.cookieHeader);

    const signIn = await startSessionFor(colleagues[0]?.userId ?? '');

    expect(signIn.status).toBe(StatusCodes.FORBIDDEN);
    expect(signInErrorSchema.parse(await signIn.json()).message).toBe(
      'Your organization is scheduled for deletion.',
    );
  });

  test('an invitation of the deleted organization is not used at sign-up', async () => {
    const { owner, organizationId } = await seedOrganizationWith([]);
    const invitationId = await insertInvitation({
      organizationId,
      inviterId: owner.userId,
      email: 'invitee@example.com',
    });
    await deleteOrganization(owner.cookieHeader);
    await db
      .update(invitation)
      .set({ status: 'pending' })
      .where(sql`${invitation.id} = ${invitationId}`);

    const invitee = await seedAuthenticatedUser({ email: 'invitee@example.com' });

    const membership = await db.query.member.findFirst({ where: { userId: invitee.userId } });
    expect(membership?.organizationId).not.toBe(organizationId);
  });

  test('task reminders skip the organization', async () => {
    const { owner } = await seedOrganizationWith([]);
    const created = await app.request(`/workspace/${owner.workspaceId}/task`, {
      method: 'POST',
      headers: { cookie: owner.cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Due soon',
        dueDate: new Date(Date.now() - 86_400_000).toISOString(),
        remindDaysBeforeDue: 1,
      }),
    });
    expect(created.status).toBe(StatusCodes.CREATED);
    expect(await listTasksDueForReminder()).toHaveLength(1);

    await deleteOrganization(owner.cookieHeader);

    expect(await listTasksDueForReminder()).toHaveLength(0);
  });

  test('workflow schedule ticks see the organization as deleted', async () => {
    const { owner } = await seedOrganizationWith([]);
    const [scheduled] = await db
      .insert(workflow)
      .values({ userId: owner.userId, workspaceId: owner.workspaceId, name: 'Nightly' })
      .returning({ id: workflow.id });
    const workflowId = scheduled?.id ?? '';
    expect(await isWorkflowOrganizationDeleted({ workflowId })).toBe(false);

    await deleteOrganization(owner.cookieHeader);
    expect(await isWorkflowOrganizationDeleted({ workflowId })).toBe(true);

    await organizationRequest(owner.cookieHeader, 'POST', '/restore');
    expect(await isWorkflowOrganizationDeleted({ workflowId })).toBe(false);
  });

  test('email sync skips the owner of the organization', async () => {
    const { owner } = await seedOrganizationWith([]);
    await createEmailAccount({
      userId: owner.userId,
      provider: 'gmail',
      email: 'owner@example.com',
    });
    expect(await listEmailAccountsDueForSync()).toHaveLength(1);

    await deleteOrganization(owner.cookieHeader);

    expect(await listEmailAccountsDueForSync()).toHaveLength(0);
  });
});

describe('POST /organization/restore', () => {
  test('re-enables the organization and the members it banned', async () => {
    const { owner, organizationId, colleagues } = await seedOrganizationWith(['member']);
    const colleague = colleagues[0];
    if (!colleague) throw new Error('missing colleague');
    await deleteOrganization(owner.cookieHeader);

    const response = await organizationRequest(owner.cookieHeader, 'POST', '/restore');

    expect(response.status).toBe(StatusCodes.OK);
    successBodySchema.parse(await response.json());
    const org = await db.query.organization.findFirst({ where: { id: organizationId } });
    expect(org?.deletedAt).toBeNull();
    const restored = await db.query.user.findFirst({ where: { id: colleague.userId } });
    expect(restored).toMatchObject({ banned: false, banReason: null, deletedAt: null });
    expect((await startSessionFor(colleague.userId)).status).toBe(StatusCodes.OK);
    const workspaceResponse = await getRoute(
      owner.cookieHeader,
      `/workspace/${owner.workspaceId}/task`,
    );
    expect(workspaceResponse.status).toBe(StatusCodes.OK);
  });

  test('keeps a member who was removed before the deletion removed', async () => {
    const { owner, colleagues } = await seedOrganizationWith(['member', 'member']);
    const [removed, other] = colleagues;
    if (!removed || !other) throw new Error('missing colleagues');
    await organizationRequest(
      owner.cookieHeader,
      'DELETE',
      `/members/${await memberIdOf(removed.userId)}`,
    );
    await deleteOrganization(owner.cookieHeader);

    await organizationRequest(owner.cookieHeader, 'POST', '/restore');

    const removedRow = await db.query.user.findFirst({ where: { id: removed.userId } });
    expect(removedRow).toMatchObject({ banned: true, banReason: 'member_removed' });
    expect(removedRow?.deletedAt).toBeInstanceOf(Date);
    const otherRow = await db.query.user.findFirst({ where: { id: other.userId } });
    expect(otherRow?.banned).toBe(false);
  });

  test('is owner only', async () => {
    const { owner, colleagues } = await seedOrganizationWith(['admin']);
    await deleteOrganization(owner.cookieHeader);

    const response = await organizationRequest(
      colleagues[0]?.cookieHeader ?? '',
      'POST',
      '/restore',
    );

    expect(response.status).not.toBe(StatusCodes.OK);
  });

  test('rejects an organization that is not deleted', async () => {
    const { owner } = await seedOrganizationWith([]);

    const response = await organizationRequest(owner.cookieHeader, 'POST', '/restore');

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });
});
