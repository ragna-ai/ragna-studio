import { getMediaById } from '@repo/database';
import {
  enqueuedJobs,
  queueAddMock,
  resetProviderMocks,
  seedAuthenticatedUser,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

const EXTRACT_JOB = 'extract-media-text';
const EXPECTED_ATTEMPTS = 3;

const ONE_PX_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const taskResponseSchema = z.strictObject({ task: z.looseObject({ id: z.string() }) });
const uploadResponseSchema = z.strictObject({
  attachments: z.array(
    z.strictObject({
      id: z.string(),
      mediaId: z.string(),
      filename: z.string(),
      mediaType: z.string(),
      size: z.number(),
      url: z.string(),
    }),
  ),
});

async function seedTask() {
  const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
  const response = await app.request(`/workspace/${workspaceId}/task`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'A task' }),
  });
  const { task } = taskResponseSchema.parse(await response.json());
  return { workspaceId, cookieHeader, taskId: task.id };
}

async function uploadFile(
  fixture: { workspaceId: string; cookieHeader: string; taskId: string },
  file: File,
) {
  const formData = new FormData();
  formData.append('files', file);
  const response = await app.request(
    `/workspace/${fixture.workspaceId}/task/${fixture.taskId}/attachments`,
    { method: 'POST', headers: { cookie: fixture.cookieHeader }, body: formData },
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  const [attachment] = uploadResponseSchema.parse(await response.json()).attachments;
  if (!attachment) {
    throw new Error('Upload returned no attachment');
  }
  return attachment;
}

const csvFile = () => new File(['name,age\nAda,36\n'], 'data.csv', { type: 'text/csv' });
const pngFile = () =>
  new File([Buffer.from(ONE_PX_PNG_BASE64, 'base64')], 'pixel.png', { type: 'image/png' });

describe('task attachment text extraction on upload', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('a csv is stored pending and queued once under its media id', async () => {
    const fixture = await seedTask();

    const attachment = await uploadFile(fixture, csvFile());

    const mediaRow = await getMediaById({ id: attachment.mediaId });
    expect(mediaRow?.textExtractionStatus).toBe('pending');
    const jobs = enqueuedJobs(EXTRACT_JOB);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.[1]).toEqual({ mediaId: attachment.mediaId });
    expect(jobs[0]?.[2]).toMatchObject({ jobId: attachment.mediaId, attempts: EXPECTED_ATTEMPTS });
  });

  test('an image gets no status and no job', async () => {
    const fixture = await seedTask();

    const attachment = await uploadFile(fixture, pngFile());

    const mediaRow = await getMediaById({ id: attachment.mediaId });
    expect(mediaRow?.textExtractionStatus).toBeNull();
    expect(enqueuedJobs(EXTRACT_JOB)).toHaveLength(0);
  });

  test('a failed enqueue still returns the upload and leaves the row pending', async () => {
    const fixture = await seedTask();
    queueAddMock.mockImplementationOnce(() => Promise.reject(new Error('redis down')));

    const attachment = await uploadFile(fixture, csvFile());

    const mediaRow = await getMediaById({ id: attachment.mediaId });
    expect(mediaRow?.textExtractionStatus).toBe('pending');
  });
});
