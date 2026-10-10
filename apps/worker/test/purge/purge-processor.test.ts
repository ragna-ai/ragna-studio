import { DELETE_MEDIA_OBJECTS_JOB, PURGE_ORGANIZATION_JOB } from '@repo/queue';
import {
  deleteObjectsMock,
  resetProviderMocks,
  seedAuthenticatedUser,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { processPurgeJob } from '../../src/processors/purge.processor';
import {
  organizationExists,
  requireOrganizationId,
  seedWorkspaceMedia,
  userExists,
} from '../support/purge-fixtures';
import { buildJob } from '../support/job';

describe('processPurgeJob', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  describe(PURGE_ORGANIZATION_JOB, () => {
    test('deletes the organization rows and passes the R2 keys of every workspace', async () => {
      const owner = await seedAuthenticatedUser();
      const organizationId = await requireOrganizationId(owner.userId);
      await seedWorkspaceMedia({
        workspaceId: owner.workspaceId,
        bucket: 'docs',
        storageKey: 'shared.pdf',
      });
      await seedWorkspaceMedia({
        workspaceId: owner.personalWorkspaceId,
        bucket: 'docs',
        storageKey: 'personal.pdf',
      });

      await processPurgeJob(buildJob({ name: PURGE_ORGANIZATION_JOB, data: { organizationId } }));

      const deletedKeys = deleteObjectsMock.mock.calls.flatMap(([, keys]) => keys).sort();
      expect(deletedKeys).toEqual(['personal.pdf', 'shared.pdf']);
      expect(await organizationExists(organizationId)).toBe(false);
      expect(await userExists(owner.userId)).toBe(false);
    });

    test('throws and keeps the rows when an R2 object fails to delete', async () => {
      const owner = await seedAuthenticatedUser();
      const organizationId = await requireOrganizationId(owner.userId);
      await seedWorkspaceMedia({ workspaceId: owner.workspaceId });
      deleteObjectsMock.mockImplementation((_bucket, keys) =>
        Promise.resolve({ deleted: [], errors: keys }),
      );

      const job = buildJob({ name: PURGE_ORGANIZATION_JOB, data: { organizationId } });

      expect(processPurgeJob(job)).rejects.toThrow('Could not delete all media objects');
      expect(await organizationExists(organizationId)).toBe(true);
    });

    test('rejects a payload without a valid organization id', async () => {
      const job = buildJob({ name: PURGE_ORGANIZATION_JOB, data: { organizationId: 'nope' } });

      expect(processPurgeJob(job)).rejects.toThrow();
    });
  });

  describe(DELETE_MEDIA_OBJECTS_JOB, () => {
    test('deletes exactly the job keys, grouped by bucket', async () => {
      const objects = [
        { bucket: 'images', key: 'a.png' },
        { bucket: 'docs', key: 'b.pdf' },
        { bucket: 'images', key: 'c.png' },
      ];

      await processPurgeJob(buildJob({ name: DELETE_MEDIA_OBJECTS_JOB, data: { objects } }));

      expect(deleteObjectsMock).toHaveBeenCalledTimes(2);
      expect(deleteObjectsMock).toHaveBeenCalledWith('images', ['a.png', 'c.png']);
      expect(deleteObjectsMock).toHaveBeenCalledWith('docs', ['b.pdf']);
    });

    test('throws so the job retries when an object fails to delete', async () => {
      deleteObjectsMock.mockImplementation((_bucket, keys) =>
        Promise.resolve({ deleted: [], errors: keys }),
      );
      const job = buildJob({
        name: DELETE_MEDIA_OBJECTS_JOB,
        data: { objects: [{ bucket: 'docs', key: 'x.pdf' }] },
      });

      expect(processPurgeJob(job)).rejects.toThrow('Could not delete all media objects');
    });

    test('rejects a payload with a malformed object', async () => {
      const job = buildJob({
        name: DELETE_MEDIA_OBJECTS_JOB,
        data: { objects: [{ bucket: 'docs' }] },
      });

      expect(processPurgeJob(job)).rejects.toThrow();
      expect(deleteObjectsMock).not.toHaveBeenCalled();
    });
  });

  test('unknown job name throws', async () => {
    const job = buildJob({ name: 'not-a-real-job', data: {} });

    expect(processPurgeJob(job)).rejects.toThrow('Unknown purge job: not-a-real-job');
  });
});
