import { getMediaById } from '@repo/database';
import {
  queueAddBulkMock,
  resetProviderMocks,
  seedAuthenticatedUser,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

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

async function uploadFiles(
  fixture: { workspaceId: string; cookieHeader: string; taskId: string },
  files: File[],
) {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  const response = await app.request(
    `/workspace/${fixture.workspaceId}/task/${fixture.taskId}/attachments`,
    { method: 'POST', headers: { cookie: fixture.cookieHeader }, body: formData },
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return uploadResponseSchema.parse(await response.json()).attachments;
}

async function uploadFile(
  fixture: { workspaceId: string; cookieHeader: string; taskId: string },
  file: File,
) {
  const [attachment] = await uploadFiles(fixture, [file]);
  if (!attachment) {
    throw new Error('Upload returned no attachment');
  }
  return attachment;
}

const pdfFile = () => new File(['%PDF-1.4\n%%EOF\n'], 'doc.pdf', { type: 'application/pdf' });
const csvFile = () => new File(['name,age\nAda,36\n'], 'data.csv', { type: 'text/csv' });
const pngFile = () =>
  new File([Buffer.from(ONE_PX_PNG_BASE64, 'base64')], 'pixel.png', { type: 'image/png' });

describe('task attachment text extraction on upload', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('a pdf and a png in one upload queue one job, for the pdf only', async () => {
    const fixture = await seedTask();

    const [pdf, png] = await uploadFiles(fixture, [pdfFile(), pngFile()]);

    expect((await getMediaById({ id: pdf?.mediaId ?? '' }))?.textExtractionStatus).toBe('pending');
    expect((await getMediaById({ id: png?.mediaId ?? '' }))?.textExtractionStatus).toBeNull();
    expect(queueAddBulkMock).toHaveBeenCalledTimes(1);
    const jobs = queueAddBulkMock.mock.calls[0]?.[0] ?? [];
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      name: 'extract-media-text',
      data: { mediaId: pdf?.mediaId },
      opts: { jobId: pdf?.mediaId, attempts: EXPECTED_ATTEMPTS },
    });
  });

  test('an image alone makes no queue call', async () => {
    const fixture = await seedTask();

    await uploadFile(fixture, pngFile());

    expect(queueAddBulkMock).not.toHaveBeenCalled();
  });

  test('a failed enqueue still returns the upload and leaves the row pending', async () => {
    const fixture = await seedTask();
    queueAddBulkMock.mockImplementationOnce(() => Promise.reject(new Error('redis down')));

    const attachment = await uploadFile(fixture, csvFile());

    const mediaRow = await getMediaById({ id: attachment.mediaId });
    expect(mediaRow?.textExtractionStatus).toBe('pending');
  });
});
