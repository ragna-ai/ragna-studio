import { createTaskAttachment, getMediaById } from '@repo/database';
import {
  deleteObjectsMock,
  resetProviderMocks,
  seedAuthenticatedUser,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { mediaSweepProcessor } from '../../src/crons/media-sweep.cron';
import { daysFromNow, hoursAgo, seedReminderTask } from '../support/crons-fixtures';
import { seedWorkspaceMedia } from '../support/purge-fixtures';

describe('media sweep cron', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('deletes unreferenced media older than 24 hours from storage and database', async () => {
    const { workspaceId } = await seedAuthenticatedUser();
    const orphan = await seedWorkspaceMedia({
      workspaceId,
      bucket: 'docs',
      storageKey: 'orphan.pdf',
      createdAt: hoursAgo(25),
    });

    await mediaSweepProcessor();

    expect(deleteObjectsMock).toHaveBeenCalledWith('docs', ['orphan.pdf']);
    expect(await getMediaById({ id: orphan.id })).toBeNull();
  });

  test('keeps fresh media', async () => {
    const { workspaceId } = await seedAuthenticatedUser();
    const fresh = await seedWorkspaceMedia({ workspaceId, createdAt: hoursAgo(1) });

    await mediaSweepProcessor();

    expect(deleteObjectsMock).not.toHaveBeenCalled();
    expect(await getMediaById({ id: fresh.id })).not.toBeNull();
  });

  test('keeps old media that is still referenced', async () => {
    const { workspaceId } = await seedAuthenticatedUser();
    const referenced = await seedWorkspaceMedia({ workspaceId, createdAt: hoursAgo(48) });
    const attachedTask = await seedReminderTask({
      workspaceId,
      dueDate: daysFromNow(1),
      remindDaysBeforeDue: 1,
    });
    await createTaskAttachment({ taskId: attachedTask.id, mediaId: referenced.id });

    await mediaSweepProcessor();

    expect(deleteObjectsMock).not.toHaveBeenCalled();
    expect(await getMediaById({ id: referenced.id })).not.toBeNull();
  });

  test('keeps the row when the storage delete fails so the next sweep retries', async () => {
    const { workspaceId } = await seedAuthenticatedUser();
    const orphan = await seedWorkspaceMedia({ workspaceId, createdAt: hoursAgo(30) });
    deleteObjectsMock.mockImplementation((_bucket, keys) =>
      Promise.resolve({ deleted: [], errors: keys }),
    );

    await mediaSweepProcessor();

    expect(await getMediaById({ id: orphan.id })).not.toBeNull();
  });
});
