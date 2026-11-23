import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createMedia,
  createTask,
  createTaskAttachment,
  db,
  getMediaById,
  sql,
} from '@repo/database';
import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';

const MIGRATION_SQL = readFileSync(
  join(
    import.meta.dir,
    '../../../../packages/database/drizzle/20261123152245_media_text_extraction/migration.sql',
  ),
  'utf8',
);
const BACKFILL_SQL = MIGRATION_SQL.split('--> statement-breakpoint').at(-1) ?? '';

beforeEach(async () => {
  await truncateAllTables();
});

describe('media text extraction backfill', () => {
  test('marks task attachment documents pending and leaves images and chat media alone', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    const task = await createTask({ workspaceId, createdByUserId: userId, title: 'A task' });

    async function seedMedia(mimeType: string, filename: string) {
      return createMedia({
        ownerWorkspaceId: workspaceId,
        bucket: 'documents',
        storageKey: `test/${filename}`,
        filename,
        mimeType,
        size: 10,
        origin: 'uploaded',
      });
    }

    const taskPdf = await seedMedia('application/pdf', 'a.pdf');
    const taskPng = await seedMedia('image/png', 'a.png');
    const chatPdf = await seedMedia('application/pdf', 'chat.pdf');
    await createTaskAttachment({ taskId: task.id, mediaId: taskPdf.id });
    await createTaskAttachment({ taskId: task.id, mediaId: taskPng.id });

    await db.execute(sql.raw(BACKFILL_SQL));

    expect((await getMediaById({ id: taskPdf.id }))?.textExtractionStatus).toBe('pending');
    expect((await getMediaById({ id: taskPng.id }))?.textExtractionStatus).toBeNull();
    expect((await getMediaById({ id: chatPdf.id }))?.textExtractionStatus).toBeNull();
  });
});
