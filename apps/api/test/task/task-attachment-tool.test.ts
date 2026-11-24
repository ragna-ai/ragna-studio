import { taskToolDefinitions } from '@repo/ai';
import { createTask, db } from '@repo/database';
import { media, taskAttachment } from '@repo/database/schema';
import { truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import * as z from 'zod';
import {
  seedOrganizationWithRoles,
  type OrganizationWithRoles,
} from '../workspace/workspace-access-fixtures';

const READ_LIMIT = 100_000;

const readTaskSchema = z.strictObject({
  task: z.strictObject({
    id: z.string(),
    displayId: z.string(),
    title: z.string(),
    description: z.string(),
    status: z.string(),
    priority: z.string(),
    dueDate: z.string().nullable(),
    remindDaysBeforeDue: z.number().nullable(),
    labels: z.array(z.string()),
    parentTaskId: z.string().nullable(),
    assignedAgent: z.string().nullable(),
    subtasks: z.array(z.unknown()),
    attachments: z.array(
      z.strictObject({
        id: z.string(),
        filename: z.string(),
        mimeType: z.string(),
        sizeBytes: z.number(),
      }),
    ),
  }),
});
const readAttachmentSchema = z.strictObject({
  filename: z.string(),
  mimeType: z.string(),
  text: z.string(),
  truncated: z.boolean(),
});
const failureSchema = z.strictObject({ status: z.string(), message: z.string() });

interface Fixture {
  org: OrganizationWithRoles;
  workspaceId: string;
  taskId: string;
}

interface AttachmentSeed {
  filename?: string;
  mimeType?: string;
  size?: number;
  textExtractionStatus?: 'pending' | 'ready' | 'failed' | null;
  extractedText?: string | null;
  extractedTextTruncated?: boolean;
}

async function seedFixture(): Promise<Fixture> {
  const org = await seedOrganizationWithRoles();
  const workspaceId = org.owner.workspaceId;
  const created = await createTask({
    workspaceId,
    title: 'A task',
    createdByUserId: org.owner.userId,
  });
  return { org, workspaceId, taskId: created.id };
}

async function attach(fixture: Fixture, seed: AttachmentSeed = {}, taskId = fixture.taskId) {
  const filename = seed.filename ?? 'contract.pdf';
  const [mediaRow] = await db
    .insert(media)
    .values({
      ownerWorkspaceId: fixture.workspaceId,
      bucket: 'documents-bucket',
      storageKey: `workspace/${fixture.workspaceId}/${crypto.randomUUID()}-${filename}`,
      filename,
      mimeType: seed.mimeType ?? 'application/pdf',
      size: seed.size ?? 1234,
      origin: 'uploaded',
      textExtractionStatus: 'textExtractionStatus' in seed ? seed.textExtractionStatus : 'ready',
      extractedText: seed.extractedText === undefined ? 'Contract text' : seed.extractedText,
      extractedTextTruncated: seed.extractedTextTruncated ?? false,
    })
    .returning({ id: media.id });
  if (!mediaRow) throw new Error('media not inserted');
  const [attachmentRow] = await db
    .insert(taskAttachment)
    .values({ taskId, mediaId: mediaRow.id })
    .returning({ id: taskAttachment.id });
  if (!attachmentRow) throw new Error('attachment not inserted');
  return attachmentRow.id;
}

function tool(name: 'readTask' | 'readTaskAttachment') {
  const definition = taskToolDefinitions({ agentId: 'agent-1' }).find((def) => def.name === name);
  if (!definition) throw new Error(`Missing ${name} tool`);
  return definition;
}

function context(fixture: Fixture) {
  return {
    userId: fixture.org.owner.userId,
    workspaceId: fixture.workspaceId,
    origin: 'agent' as const,
  };
}

function readAttachment(fixture: Fixture, taskId: string, attachmentId: string) {
  return tool('readTaskAttachment').execute({ taskId, attachmentId }, context(fixture));
}

beforeEach(async () => {
  await truncateAllTables();
});

describe('readTask attachments', () => {
  test('lists both attachments with id, file name, mime type and size, without content', async () => {
    const fixture = await seedFixture();
    const pdfId = await attach(fixture, { filename: 'a.pdf', size: 10 });
    const docxId = await attach(fixture, {
      filename: 'b.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 20,
    });

    const result = readTaskSchema.parse(
      await tool('readTask').execute({ id: fixture.taskId }, context(fixture)),
    );

    expect(result.task.attachments).toEqual([
      { id: pdfId, filename: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 10 },
      {
        id: docxId,
        filename: 'b.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: 20,
      },
    ]);
  });

  test('returns an empty attachment list for a task without attachments', async () => {
    const fixture = await seedFixture();

    const result = readTaskSchema.parse(
      await tool('readTask').execute({ id: fixture.taskId }, context(fixture)),
    );

    expect(result.task.attachments).toEqual([]);
  });
});

describe('readTaskAttachment', () => {
  test('returns the extracted text of a document and truncated false', async () => {
    const fixture = await seedFixture();
    const attachmentId = await attach(fixture, { extractedText: 'Deadline: 1 March' });

    const result = readAttachmentSchema.parse(
      await readAttachment(fixture, fixture.taskId, attachmentId),
    );

    expect(result).toEqual({
      filename: 'contract.pdf',
      mimeType: 'application/pdf',
      text: 'Deadline: 1 March',
      truncated: false,
    });
  });

  test('returns the stored text of an over-long file with truncated true', async () => {
    const fixture = await seedFixture();
    const attachmentId = await attach(fixture, {
      extractedText: 'x'.repeat(READ_LIMIT),
      extractedTextTruncated: true,
    });

    const result = readAttachmentSchema.parse(
      await readAttachment(fixture, fixture.taskId, attachmentId),
    );

    expect(result.text).toHaveLength(READ_LIMIT);
    expect(result.truncated).toBe(true);
  });

  test('fails with not_ready and a retry hint while extraction is pending', async () => {
    const fixture = await seedFixture();
    const attachmentId = await attach(fixture, {
      textExtractionStatus: 'pending',
      extractedText: null,
    });

    const result = failureSchema.parse(await readAttachment(fixture, fixture.taskId, attachmentId));

    expect(result.status).toBe('not_ready');
    expect(result.message).toContain('Try again later');
  });

  test.each([
    [
      'a pdf that has no status',
      { textExtractionStatus: null, extractedText: null },
      'not_readable',
      '"contract.pdf" has no extracted text.',
    ],
    [
      'an image',
      {
        textExtractionStatus: null,
        extractedText: null,
        filename: 'photo.png',
        mimeType: 'image/png',
      },
      'not_readable',
      '"photo.png" is an image; its text can\'t be read.',
    ],
    [
      'a failed extraction',
      { textExtractionStatus: 'failed' as const, extractedText: null },
      'not_readable',
      'Text extraction failed for "contract.pdf".',
    ],
    [
      'a file without text',
      { textExtractionStatus: 'ready' as const, extractedText: '' },
      'not_readable',
      '"contract.pdf" contains no readable text (it may be a scanned document).',
    ],
  ])('explains %s', async (_label, seed: AttachmentSeed, status, message) => {
    const fixture = await seedFixture();
    const attachmentId = await attach(fixture, seed);

    const result = failureSchema.parse(await readAttachment(fixture, fixture.taskId, attachmentId));

    expect(result).toEqual({ status, message });
  });

  test('fails with not_found for an attachment of another task', async () => {
    const fixture = await seedFixture();
    const otherTask = await createTask({
      workspaceId: fixture.workspaceId,
      title: 'Other',
      createdByUserId: fixture.org.owner.userId,
    });
    const attachmentId = await attach(fixture, {}, otherTask.id);

    const result = failureSchema.parse(await readAttachment(fixture, fixture.taskId, attachmentId));

    expect(result.status).toBe('not_found');
  });

  test('fails with not_found for a task in another workspace', async () => {
    const fixture = await seedFixture();
    const foreign = await seedFixture();
    const attachmentId = await attach(foreign);

    const result = failureSchema.parse(await readAttachment(fixture, foreign.taskId, attachmentId));

    expect(result.status).toBe('not_found');
  });
});
