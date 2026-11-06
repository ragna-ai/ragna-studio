import { PROBLEM_CONTENT_TYPE, problemDetailsSchema, problemTypeUri } from '@repo/api-errors';
import {
  resetProviderMocks,
  seedAuthenticatedUser,
  seedEmailThreadWithMessage,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { seedConnectedGmailAccount } from './support/email-fixtures';
import { resetEmailQueueMock } from './support/email-queue.mock';

const draftRefSchema = z.object({ id: z.string(), kind: z.string() });

beforeEach(async () => {
  await truncateAllTables();
  resetProviderMocks();
  resetEmailQueueMock();
});

describe('creating a second draft on a thread', () => {
  test('answers an email-draft-exists problem that carries the existing draft', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { accountId } = await seedConnectedGmailAccount({ userId, cookieHeader });
    const seeded = await seedEmailThreadWithMessage({ accountId });
    const createDraft = () =>
      app.request('/email/draft', {
        method: 'POST',
        headers: { cookie: cookieHeader, 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'reply',
          threadId: seeded.thread.id,
          replyToMessageId: seeded.messageId,
        }),
      });
    const first = await createDraft();
    const firstDraft = z.object({ draft: draftRefSchema }).parse(await first.json()).draft;

    const second = await createDraft();

    expect(second.status).toBe(StatusCodes.CONFLICT);
    expect(second.headers.get('content-type')).toContain(PROBLEM_CONTENT_TYPE);
    const problem = problemDetailsSchema.parse(await second.json());
    expect(problem.type).toBe(problemTypeUri('email-draft-exists'));
    expect(draftRefSchema.parse(problem.draft).id).toBe(firstDraft.id);
  });
});
