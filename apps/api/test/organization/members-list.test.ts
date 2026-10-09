import { seedAuthenticatedUser, seedOrganizationMember, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { activeOrganizationId } from './invitation-fixtures';
import { memberIdOf, organizationRequest } from './member-fixtures';

const membersBodySchema = z.strictObject({
  members: z.array(
    z.strictObject({
      id: z.string(),
      userId: z.string(),
      role: z.string(),
      createdAt: z.string(),
      user: z.strictObject({
        name: z.string(),
        email: z.string(),
        image: z.string().nullable(),
        deletedAt: z.string().nullable(),
      }),
    }),
  ),
});
const organizationDeletedBodySchema = z.strictObject({
  code: z.literal('ORGANIZATION_DELETED'),
  error: z.string(),
});

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
  return { owner, colleagues };
}

describe('GET /organization/members', () => {
  test('lists active and removed members with deletedAt', async () => {
    const { owner, colleagues } = await seedOrganizationWith(['member', 'member']);
    const [kept, removed] = colleagues;
    const removedMemberId = await memberIdOf(removed?.userId ?? '');
    await organizationRequest(owner.cookieHeader, 'DELETE', `/members/${removedMemberId}`);

    const response = await organizationRequest(owner.cookieHeader, 'GET', '/members');

    expect(response.status).toBe(StatusCodes.OK);
    const { members } = membersBodySchema.parse(await response.json());
    expect(members).toHaveLength(3);
    const byUserId = new Map(members.map((row) => [row.userId, row]));
    expect(byUserId.get(owner.userId)).toMatchObject({ role: 'owner' });
    expect(byUserId.get(owner.userId)?.user.deletedAt).toBeNull();
    expect(byUserId.get(kept?.userId ?? '')?.user.deletedAt).toBeNull();
    expect(byUserId.get(removed?.userId ?? '')?.id).toBe(removedMemberId);
    expect(byUserId.get(removed?.userId ?? '')?.user.deletedAt).not.toBeNull();
  });

  test('a plain member can read the list', async () => {
    const { colleagues } = await seedOrganizationWith(['member']);

    const response = await organizationRequest(
      colleagues[0]?.cookieHeader ?? '',
      'GET',
      '/members',
    );

    expect(response.status).toBe(StatusCodes.OK);
    expect(membersBodySchema.parse(await response.json()).members).toHaveLength(2);
  });

  test('does not include members of another organization', async () => {
    const { owner } = await seedOrganizationWith(['member']);
    const outsider = await seedAuthenticatedUser();

    const response = await organizationRequest(owner.cookieHeader, 'GET', '/members');

    const { members } = membersBodySchema.parse(await response.json());
    expect(members.map((row) => row.userId)).not.toContain(outsider.userId);
  });

  test('answers ORGANIZATION_DELETED while the organization is deleted', async () => {
    const { owner } = await seedOrganizationWith([]);
    await organizationRequest(owner.cookieHeader, 'DELETE', '');

    const response = await organizationRequest(owner.cookieHeader, 'GET', '/members');

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    organizationDeletedBodySchema.parse(await response.json());
  });

  test('requires a session', async () => {
    const response = await organizationRequest('', 'GET', '/members');
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });
});
