import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

const errorBodySchema = z.strictObject({ message: z.string(), code: z.string() });

const sessionBodySchema = z.object({
  session: z.object({ activeOrganizationId: z.string() }),
});

async function errorBody(response: Response) {
  return errorBodySchema.parse(await response.json());
}

beforeEach(async () => {
  await truncateAllTables();
});

async function postOrganizationRoute(cookieHeader: string, route: string, body: object) {
  return app.request(`/auth/organization/${route}`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('organization plugin routes', () => {
  test('creating another organization is forbidden', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await postOrganizationRoute(cookieHeader, 'create', {
      name: 'Second',
      slug: 'second-org',
    });

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
  });

  test('deleting the organization is disabled', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(cookieHeader);

    const response = await postOrganizationRoute(cookieHeader, 'delete', { organizationId });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect((await errorBody(response)).code).toBe('ORGANIZATION_DELETION_DISABLED');
  });

  test('inviting a member is forbidden', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(cookieHeader);

    const response = await postOrganizationRoute(cookieHeader, 'invite-member', {
      email: 'invitee@example.com',
      role: 'member',
      organizationId,
    });

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
  });

  test('the only owner cannot leave', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(cookieHeader);

    const response = await postOrganizationRoute(cookieHeader, 'leave', { organizationId });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await errorBody(response)).code).toBe(
      'YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER',
    );
  });
});

async function activeOrganizationId(cookieHeader: string): Promise<string> {
  const response = await app.request('/auth/get-session', { headers: { cookie: cookieHeader } });
  const body = sessionBodySchema.parse(await response.json());
  return body.session.activeOrganizationId;
}
