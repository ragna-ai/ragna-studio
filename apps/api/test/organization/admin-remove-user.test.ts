import { createMedia, db, sql } from '@repo/database';
import { media, user as userTable } from '@repo/database/schema';
import {
  DELETE_MEDIA_OBJECTS_JOB,
  deleteMediaObjectsJobSchema,
  PURGE_ORGANIZATION_JOB,
  purgeOrganizationJobSchema,
} from '@repo/queue';
import { purgeOrganization } from '@repo/media';
import {
  deleteObjectsMock,
  queueAddBulkMock,
  queueAddMock,
  resetQueueMock,
  resetStorageProviderMock,
  seedAuthenticatedUser,
  seedOrganizationMember,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { activeOrganizationId } from './invitation-fixtures';
import { organizationRequest } from './member-fixtures';

const errorBodySchema = z.object({ message: z.string() });

beforeEach(async () => {
  await truncateAllTables();
  resetQueueMock();
  resetStorageProviderMock();
});

async function removeUserAsPlatformAdmin(userId: string) {
  const platformAdmin = await seedAuthenticatedUser();
  await db
    .update(userTable)
    .set({ role: 'admin' })
    .where(sql`${userTable.id} = ${platformAdmin.userId}`);
  return app.request('/auth/admin/remove-user', {
    method: 'POST',
    headers: { cookie: platformAdmin.cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
}

async function seedOwnerWithColleague() {
  const owner = await seedAuthenticatedUser();
  const organizationId = await activeOrganizationId(owner.cookieHeader);
  const colleague = await seedOrganizationMember({ organizationId, role: 'member' });
  return { owner, colleague, organizationId };
}

describe('platform admin remove-user', () => {
  test('is blocked while the user owns an organization with active members', async () => {
    const { owner, organizationId } = await seedOwnerWithColleague();

    const response = await removeUserAsPlatformAdmin(owner.userId);

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(errorBodySchema.parse(await response.json()).message).toBe(
      'Transfer ownership or delete the organization first.',
    );
    expect(await db.query.user.findFirst({ where: { id: owner.userId } })).toBeDefined();
    const org = await db.query.organization.findFirst({ where: { id: organizationId } });
    expect(org?.deletedAt).toBeNull();
    expect(
      queueAddMock.mock.calls.filter(([name]) => name === PURGE_ORGANIZATION_JOB),
    ).toHaveLength(0);
  });

  test('a sole owner marks the organization deleted and enqueues the purge job', async () => {
    const owner = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(owner.cookieHeader);

    const response = await removeUserAsPlatformAdmin(owner.userId);

    expect(response.status).toBe(StatusCodes.OK);
    expect(await db.query.user.findFirst({ where: { id: owner.userId } })).toBeUndefined();
    const org = await db.query.organization.findFirst({ where: { id: organizationId } });
    expect(org?.deletedAt).toBeInstanceOf(Date);
    const purgeCalls = queueAddMock.mock.calls.filter(([name]) => name === PURGE_ORGANIZATION_JOB);
    expect(purgeCalls).toHaveLength(1);
    expect(purgeOrganizationJobSchema.parse(purgeCalls[0]?.[1])).toEqual({ organizationId });
  });

  test('running the enqueued job removes the organization, workspaces and R2 objects', async () => {
    const owner = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(owner.cookieHeader);
    const storageKey = `org/${organizationId}/file.pdf`;
    await createMedia({
      ownerWorkspaceId: owner.workspaceId,
      bucket: 'documents-bucket',
      storageKey,
      filename: 'file.pdf',
      mimeType: 'application/pdf',
      size: 10,
      origin: 'uploaded',
    });
    await removeUserAsPlatformAdmin(owner.userId);

    await purgeOrganization({ organizationId });

    expect(
      await db.query.organization.findFirst({ where: { id: organizationId } }),
    ).toBeUndefined();
    expect(
      await db.query.workspace.findFirst({ where: { id: owner.workspaceId } }),
    ).toBeUndefined();
    expect(deleteObjectsMock).toHaveBeenCalledWith('documents-bucket', [storageKey]);
  });

  test('a non-owner member has their personal workspace objects queued for deletion', async () => {
    const { colleague } = await seedOwnerWithColleague();
    const storageKey = `user/${colleague.userId}/private.pdf`;
    await createMedia({
      ownerWorkspaceId: colleague.personalWorkspaceId,
      bucket: 'documents-bucket',
      storageKey,
      filename: 'private.pdf',
      mimeType: 'application/pdf',
      size: 10,
      origin: 'uploaded',
    });

    const response = await removeUserAsPlatformAdmin(colleague.userId);

    expect(response.status).toBe(StatusCodes.OK);
    expect(queueAddBulkMock).toHaveBeenCalledTimes(1);
    const [jobs] = queueAddBulkMock.mock.calls[0] ?? [[]];
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.name).toBe(DELETE_MEDIA_OBJECTS_JOB);
    expect(jobs[0]?.opts).toEqual({ attempts: 3 });
    expect(deleteMediaObjectsJobSchema.parse(jobs[0]?.data)).toEqual({
      objects: [{ bucket: 'documents-bucket', key: storageKey }],
    });
    expect(deleteObjectsMock).not.toHaveBeenCalled();
    expect(await db.query.user.findFirst({ where: { id: colleague.userId } })).toBeUndefined();
  });

  test('enqueues nothing when the personal workspace has no media', async () => {
    const { colleague } = await seedOwnerWithColleague();

    const response = await removeUserAsPlatformAdmin(colleague.userId);

    expect(response.status).toBe(StatusCodes.OK);
    expect(queueAddBulkMock).not.toHaveBeenCalled();
  });

  test('splits more than 1000 objects into jobs of at most 1000 in one bulk call', async () => {
    const { colleague } = await seedOwnerWithColleague();
    await db.insert(media).values(
      Array.from({ length: 1001 }, (_, index) => ({
        ownerWorkspaceId: colleague.personalWorkspaceId,
        bucket: 'documents-bucket',
        storageKey: `user/${colleague.userId}/file-${index}.pdf`,
        filename: `file-${index}.pdf`,
        mimeType: 'application/pdf',
        size: 10,
        origin: 'uploaded' as const,
      })),
    );

    const response = await removeUserAsPlatformAdmin(colleague.userId);

    expect(response.status).toBe(StatusCodes.OK);
    expect(queueAddBulkMock).toHaveBeenCalledTimes(1);
    const [jobs] = queueAddBulkMock.mock.calls[0] ?? [[]];
    const sizes = jobs.map((job) => deleteMediaObjectsJobSchema.parse(job.data).objects.length);
    expect(sizes.toSorted()).toEqual([1, 1000]);
  });

  test('a failed enqueue does not block removing a non-owner member', async () => {
    const { colleague } = await seedOwnerWithColleague();
    await createMedia({
      ownerWorkspaceId: colleague.personalWorkspaceId,
      bucket: 'documents-bucket',
      storageKey: `user/${colleague.userId}/private.pdf`,
      filename: 'private.pdf',
      mimeType: 'application/pdf',
      size: 10,
      origin: 'uploaded',
    });
    queueAddBulkMock.mockImplementationOnce(() => Promise.reject(new Error('Redis down')));

    const response = await removeUserAsPlatformAdmin(colleague.userId);

    expect(response.status).toBe(StatusCodes.OK);
    expect(await db.query.user.findFirst({ where: { id: colleague.userId } })).toBeUndefined();
  });

  test('already removed members do not block a sole owner', async () => {
    const { owner, colleague, organizationId } = await seedOwnerWithColleague();
    const memberRow = await db.query.organizationMember.findFirst({
      where: { userId: colleague.userId },
    });
    await organizationRequest(owner.cookieHeader, 'DELETE', `/members/${memberRow?.id}`);

    const response = await removeUserAsPlatformAdmin(owner.userId);

    expect(response.status).toBe(StatusCodes.OK);
    const org = await db.query.organization.findFirst({ where: { id: organizationId } });
    expect(org?.deletedAt).toBeInstanceOf(Date);
  });

  test('a plain member is removed without touching the organization', async () => {
    const { colleague, organizationId } = await seedOwnerWithColleague();

    const response = await removeUserAsPlatformAdmin(colleague.userId);

    expect(response.status).toBe(StatusCodes.OK);
    expect(await db.query.user.findFirst({ where: { id: colleague.userId } })).toBeUndefined();
    const org = await db.query.organization.findFirst({ where: { id: organizationId } });
    expect(org?.deletedAt).toBeNull();
    expect(
      queueAddMock.mock.calls.filter(([name]) => name === PURGE_ORGANIZATION_JOB),
    ).toHaveLength(0);
  });
});
