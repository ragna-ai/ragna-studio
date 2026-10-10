import { config } from '@repo/config';
import { db } from '@repo/database';
import { logger } from '@repo/logger';
import {
  INVITATION_EMAIL_JOB,
  invitationEmailJobSchema,
  WELCOME_EMAIL_JOB,
  welcomeEmailJobSchema,
} from '@repo/queue';
import {
  queueAddMock,
  resetQueueMock,
  seedAuthenticatedUser,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { activeOrganizationId, postOrganizationRoute } from './invitation-fixtures';

const invitationBodySchema = z.object({ id: z.string() });

beforeEach(async () => {
  resetQueueMock();
  await truncateAllTables();
});

function enqueuedJobs(jobName: string) {
  return queueAddMock.mock.calls.filter(([name]) => name === jobName);
}

function inviteMember(cookieHeader: string, organizationId: string, role: string) {
  return postOrganizationRoute(cookieHeader, 'invite-member', {
    email: 'new@example.com',
    role,
    organizationId,
  });
}

describe('invitation email', () => {
  test('creating an invitation enqueues the email with the accept link', async () => {
    const owner = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(owner.cookieHeader);
    const organization = await db.query.organization.findFirst({ where: { id: organizationId } });
    const ownerUser = await db.query.user.findFirst({ where: { id: owner.userId } });

    const response = await inviteMember(owner.cookieHeader, organizationId, 'member');

    expect(response.status).toBe(StatusCodes.OK);
    const { id } = invitationBodySchema.parse(await response.json());
    const jobs = enqueuedJobs(INVITATION_EMAIL_JOB);
    expect(jobs).toHaveLength(1);
    expect(invitationEmailJobSchema.parse(jobs[0]?.[1])).toMatchObject({
      email: 'new@example.com',
      inviterName: ownerUser?.name,
      organizationName: organization?.name,
      url: `${config.appUrl}/auth/login?invitation=${id}`,
    });
  });

  test('a rejected invitation enqueues nothing', async () => {
    const owner = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(owner.cookieHeader);

    const response = await inviteMember(owner.cookieHeader, organizationId, 'owner');

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(enqueuedJobs(INVITATION_EMAIL_JOB)).toHaveLength(0);
  });

  test('an enqueue failure is logged and the invitation still succeeds', async () => {
    const owner = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(owner.cookieHeader);
    const errorLog = spyOn(logger, 'error');
    queueAddMock.mockImplementationOnce(() => Promise.reject(new Error('redis down')));

    const response = await inviteMember(owner.cookieHeader, organizationId, 'member');

    expect(response.status).toBe(StatusCodes.OK);
    expect(errorLog.mock.calls.map(([message]) => message)).toContain(
      'Failed to enqueue invitation email',
    );
    errorLog.mockRestore();
  });
});

describe('welcome email', () => {
  test('seeding a user enqueues the welcome email', async () => {
    await seedAuthenticatedUser({ email: 'welcome@example.com' });

    const jobs = enqueuedJobs(WELCOME_EMAIL_JOB);
    expect(jobs).toHaveLength(1);
    expect(welcomeEmailJobSchema.parse(jobs[0]?.[1]).email).toBe('welcome@example.com');
  });

  test('an enqueue failure is logged and the user is still created', async () => {
    const errorLog = spyOn(logger, 'error');
    queueAddMock.mockImplementationOnce(() => Promise.reject(new Error('redis down')));

    const user = await seedAuthenticatedUser();

    expect(user.userId).toBeString();
    expect(errorLog.mock.calls.map(([message]) => message)).toContain(
      'Failed to enqueue welcome email',
    );
    errorLog.mockRestore();
  });
});
