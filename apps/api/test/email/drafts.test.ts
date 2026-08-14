import { resetProviderMocks, seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import {
  createAgentForWorkspace,
  seedConnectedGmailAccount,
  seedEmailDraft,
  seedEmailThreadWithMessage,
} from './support/email-fixtures';
import { emailDraftAddMock, resetEmailQueueMock } from './support/email-queue.mock';
import { resetMailProviderMock } from './support/mail-provider.mock';

// Draft lifecycle (docs/email/prd.md, "Auto-draft replies" / "Drafts: list,
// trigger manual draft, edit, discard, send"). `send` is covered separately
// in send.test.ts alongside POST /email/send, since both share the
// freshly-refactored multipart contract (validation/email.schema.ts).
// Trigger only enqueues (the worker owns writing the email_drafts row), so
// generating/ready rows for the edit/discard/pending tests are seeded
// directly (test/email/support/email-fixtures.ts's seedEmailDraft).

beforeEach(async () => {
  await truncateAllTables();
  resetProviderMocks();
  resetMailProviderMock();
  resetEmailQueueMock();
});

async function connectAccountWithAgent() {
  const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
  const { accountId } = await seedConnectedGmailAccount({ userId, cookieHeader });
  const agentId = await createAgentForWorkspace(cookieHeader, workspaceId);
  return { userId, workspaceId, cookieHeader, accountId, agentId };
}

describe('POST /email/draft/trigger', () => {
  test('enqueues with the account default (no agentId override) and returns 202', async () => {
    const { cookieHeader, accountId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });

    const response = await app.request('/email/draft/trigger', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ threadId: seeded.thread.id, replyToMessageId: seeded.messageId }),
    });

    expect(response.status).toBe(StatusCodes.ACCEPTED);
    expect(emailDraftAddMock).toHaveBeenCalledTimes(1);
    const jobData = emailDraftAddMock.mock.calls[0]?.[1] as {
      accountId: string;
      threadId: string;
      replyToMessageId: string;
      agentId?: string;
    };
    expect(jobData).toMatchObject({ accountId, threadId: seeded.thread.id, replyToMessageId: seeded.messageId });
    expect(jobData.agentId).toBeUndefined();
  });

  test('enqueues with an explicit agentId override when the agent is owned by the caller', async () => {
    const { cookieHeader, accountId, agentId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });

    const response = await app.request('/email/draft/trigger', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ threadId: seeded.thread.id, replyToMessageId: seeded.messageId, agentId }),
    });

    expect(response.status).toBe(StatusCodes.ACCEPTED);
    const jobData = emailDraftAddMock.mock.calls[0]?.[1] as { agentId?: string };
    expect(jobData.agentId).toBe(agentId);
  });

  test('rejects an agentId owned by another user', async () => {
    const { cookieHeader, accountId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });
    const other = await seedAuthenticatedUser();
    const otherAgentId = await createAgentForWorkspace(other.cookieHeader, other.workspaceId);

    const response = await app.request('/email/draft/trigger', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ threadId: seeded.thread.id, replyToMessageId: seeded.messageId, agentId: otherAgentId }),
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(emailDraftAddMock).not.toHaveBeenCalled();
  });

  test('rejects a replyToMessageId that does not belong to threadId', async () => {
    const { cookieHeader, accountId } = await connectAccountWithAgent();
    const seededA = await seedEmailThreadWithMessage({ accountId });
    const seededB = await seedEmailThreadWithMessage({ accountId });

    const response = await app.request('/email/draft/trigger', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ threadId: seededA.thread.id, replyToMessageId: seededB.messageId }),
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(emailDraftAddMock).not.toHaveBeenCalled();
  });
});

const draftSchema = z.object({ id: z.string(), status: z.string(), content: z.string() });

describe('GET /email/draft/pending', () => {
  test('returns generating and ready drafts, not discarded/sent ones', async () => {
    const { cookieHeader, accountId, agentId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });

    const generating = await seedEmailDraft({
      accountId,
      threadId: seeded.thread.id,
      agentId,
      status: 'generating',
    });
    const ready = await seedEmailDraft({ accountId, threadId: seeded.thread.id, agentId, status: 'ready' });
    await seedEmailDraft({ accountId, threadId: seeded.thread.id, agentId, status: 'discarded' });
    await seedEmailDraft({ accountId, threadId: seeded.thread.id, agentId, status: 'sent' });

    const response = await app.request('/email/draft/pending', { headers: { cookie: cookieHeader } });

    expect(response.status).toBe(StatusCodes.OK);
    const body = z.object({ drafts: z.array(draftSchema) }).parse(await response.json());
    expect(body.drafts.map((draft) => draft.id).sort()).toEqual([generating.id, ready.id].sort());
  });
});

describe('PATCH /email/draft/:draftId', () => {
  test('edits the draft content', async () => {
    const { cookieHeader, accountId, agentId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });
    const draft = await seedEmailDraft({ accountId, threadId: seeded.thread.id, agentId });

    const response = await app.request(`/email/draft/${draft.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'Edited reply body.' }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = z.object({ draft: draftSchema }).parse(await response.json());
    expect(body.draft.content).toBe('Edited reply body.');
  });

  test('404s for a draft on another account', async () => {
    const { cookieHeader } = await connectAccountWithAgent();
    const other = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId: other.accountId });
    const draft = await seedEmailDraft({ accountId: other.accountId, threadId: seeded.thread.id, agentId: other.agentId });

    const response = await app.request(`/email/draft/${draft.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'Should not apply.' }),
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('POST /email/draft/:draftId/discard', () => {
  test('flips status to discarded', async () => {
    const { cookieHeader, accountId, agentId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });
    const draft = await seedEmailDraft({ accountId, threadId: seeded.thread.id, agentId, status: 'ready' });

    const response = await app.request(`/email/draft/${draft.id}/discard`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = z.object({ draft: draftSchema }).parse(await response.json());
    expect(body.draft.status).toBe('discarded');
  });
});
