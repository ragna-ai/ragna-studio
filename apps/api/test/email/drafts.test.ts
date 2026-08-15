import { GmailApiError } from '@repo/mail/provider';
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
import {
  buildFakeMailMessage,
  createDraftMock,
  deleteDraftMock,
  fetchMessageMock,
  getAttachmentMock,
  getDraftAttachmentMock,
  resetMailProviderMock,
  sendDraftMock,
  sendMock,
  updateDraftMock,
} from './support/mail-provider.mock';

type FormValue = string | File | Array<string | File> | undefined;

function buildFormData(fields: Record<string, FormValue>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      formData.append(key, entry);
    }
  }
  return formData;
}

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

  test('deletes the Gmail draft first when providerDraftId is set', async () => {
    const { cookieHeader, accountId, agentId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });
    const draft = await seedEmailDraft({
      accountId,
      threadId: seeded.thread.id,
      agentId,
      status: 'ready',
      providerDraftId: 'gmail-draft-discard-1',
    });

    const response = await app.request(`/email/draft/${draft.id}/discard`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(deleteDraftMock).toHaveBeenCalledTimes(1);
    expect(deleteDraftMock.mock.calls[0]?.[0]).toBe('gmail-draft-discard-1');
    const body = z.object({ draft: draftSchema }).parse(await response.json());
    expect(body.draft.status).toBe('discarded');
  });

  test('tolerates a 404 from Gmail (already gone) as success', async () => {
    const { cookieHeader, accountId, agentId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });
    const draft = await seedEmailDraft({
      accountId,
      threadId: seeded.thread.id,
      agentId,
      status: 'ready',
      providerDraftId: 'gmail-draft-discard-2',
    });
    deleteDraftMock.mockImplementationOnce(() => Promise.reject(new GmailApiError('Not Found', 404)));

    const response = await app.request(`/email/draft/${draft.id}/discard`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = z.object({ draft: draftSchema }).parse(await response.json());
    expect(body.draft.status).toBe('discarded');
  });

  test('surfaces a non-404 Gmail failure instead of silently discarding', async () => {
    const { cookieHeader, accountId, agentId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });
    const draft = await seedEmailDraft({
      accountId,
      threadId: seeded.thread.id,
      agentId,
      status: 'ready',
      providerDraftId: 'gmail-draft-discard-3',
    });
    deleteDraftMock.mockImplementationOnce(() => Promise.reject(new GmailApiError('Server error', 500)));

    const response = await app.request(`/email/draft/${draft.id}/discard`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
  });
});

describe('POST /email/draft - creation per kind', () => {
  test('kind: new creates an empty, unthreaded, ready draft', async () => {
    const { cookieHeader } = await connectAccountWithAgent();

    const response = await app.request('/email/draft', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'new' }),
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    const body = z
      .object({
        draft: z.object({
          origin: z.string(),
          kind: z.string(),
          threadId: z.string().nullable(),
          replyToMessageId: z.string().nullable(),
          to: z.array(z.unknown()),
          status: z.string(),
        }),
      })
      .parse(await response.json());
    expect(body.draft.origin).toBe('user');
    expect(body.draft.kind).toBe('new');
    expect(body.draft.threadId).toBeNull();
    expect(body.draft.replyToMessageId).toBeNull();
    expect(body.draft.to).toEqual([]);
    expect(body.draft.status).toBe('ready');
  });

  test('kind: new rejects a threadId', async () => {
    const { cookieHeader, accountId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });

    const response = await app.request('/email/draft', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'new', threadId: seeded.thread.id }),
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });

  test('kind: reply seeds `to` from the replied-to message\'s sender, and leaves `cc` empty', async () => {
    const { cookieHeader, accountId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({
      accountId,
      from: { name: 'Ada Lovelace', email: 'ada@example.test' },
    });

    const response = await app.request('/email/draft', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'reply',
        threadId: seeded.thread.id,
        replyToMessageId: seeded.messageId,
      }),
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    const body = z
      .object({
        draft: z.object({
          kind: z.string(),
          threadId: z.string().nullable(),
          replyToMessageId: z.string().nullable(),
          to: z.array(z.object({ name: z.string().nullable(), email: z.string() })),
          cc: z.array(z.unknown()),
        }),
      })
      .parse(await response.json());
    expect(body.draft.kind).toBe('reply');
    expect(body.draft.threadId).toBe(seeded.thread.id);
    expect(body.draft.replyToMessageId).toBe(seeded.messageId);
    expect(body.draft.to).toEqual([{ name: 'Ada Lovelace', email: 'ada@example.test' }]);
    // Reply-all is not a kind (the client PATCHes `cc` in separately); the
    // server must never seed it, or the two would fight.
    expect(body.draft.cc).toEqual([]);
  });

  test('kind: reply seeds `content` with the quoted source message as HTML, and `text` as its plain-text sibling (buildReplyQuoteHtml)', async () => {
    const { cookieHeader, accountId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({
      accountId,
      from: { name: 'Ada Lovelace', email: 'ada@example.test' },
      htmlBody: '<p>Original message body.</p>',
    });

    const response = await app.request('/email/draft', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'reply',
        threadId: seeded.thread.id,
        replyToMessageId: seeded.messageId,
      }),
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    const body = z
      .object({ draft: z.object({ content: z.string(), text: z.string() }) })
      .parse(await response.json());
    expect(body.draft.content).toContain('Ada Lovelace &lt;ada@example.test&gt; wrote:');
    expect(body.draft.content).toContain('<blockquote>');
    expect(body.draft.content).toContain('<p>Original message body.</p>');
    expect(body.draft.text).toContain('Ada Lovelace <ada@example.test> wrote:');
    expect(body.draft.text).toContain('Original message body.');
  });

  test('kind: reply live-fetches the source body when it is not persisted yet (lazy-body gap), and falls back to a rendered HTML quote when the live message has no HTML part', async () => {
    const { cookieHeader, accountId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({
      accountId,
      from: { name: 'Ada Lovelace', email: 'ada@example.test' },
      withBody: false,
    });
    fetchMessageMock.mockImplementationOnce((messageId: string) =>
      Promise.resolve(
        buildFakeMailMessage({
          id: messageId,
          body: { text: 'Live-fetched body.', html: null, attachments: [] },
        }),
      ),
    );

    const response = await app.request('/email/draft', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'reply',
        threadId: seeded.thread.id,
        replyToMessageId: seeded.messageId,
      }),
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    expect(fetchMessageMock).toHaveBeenCalledTimes(1);
    const body = z
      .object({ draft: z.object({ content: z.string(), text: z.string() }) })
      .parse(await response.json());
    expect(body.draft.content).toContain('<blockquote>');
    expect(body.draft.content).toContain('Live-fetched body.');
    expect(body.draft.text).toContain('Live-fetched body.');
  });

  test('kind: reply 400s without a threadId', async () => {
    const { cookieHeader } = await connectAccountWithAgent();

    const response = await app.request('/email/draft', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'reply' }),
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });

  test('kind: forward seeds empty recipients plus the forwarded message\'s attachments', async () => {
    const { cookieHeader, accountId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });

    fetchMessageMock.mockImplementationOnce((messageId: string) =>
      Promise.resolve(
        buildFakeMailMessage({
          id: messageId,
          body: {
            text: 'Body',
            html: null,
            attachments: [
              {
                id: 'att-1',
                filename: 'invoice.pdf',
                mimeType: 'application/pdf',
                size: 1234,
                inline: false,
              },
            ],
          },
        }),
      ),
    );

    const response = await app.request('/email/draft', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'forward',
        threadId: seeded.thread.id,
        replyToMessageId: seeded.messageId,
      }),
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    const body = z
      .object({
        draft: z.object({
          kind: z.string(),
          to: z.array(z.unknown()),
          content: z.string(),
          attachments: z.array(
            z.object({
              providerMessageId: z.string().nullable(),
              providerAttachmentId: z.string(),
              filename: z.string(),
              mimeType: z.string(),
              size: z.number(),
            }),
          ),
        }),
      })
      .parse(await response.json());
    expect(body.draft.kind).toBe('forward');
    expect(body.draft.to).toEqual([]);
    // Forward also gets the quoted-source seed (same helper as reply).
    expect(body.draft.content).toContain('wrote:');
    expect(body.draft.content).toContain('<blockquote>');
    expect(body.draft.content).toContain('<p>Hello, this is a seeded message body.</p>');
    expect(body.draft.attachments).toHaveLength(1);
    expect(body.draft.attachments[0]).toMatchObject({
      providerAttachmentId: 'att-1',
      filename: 'invoice.pdf',
      mimeType: 'application/pdf',
      size: 1234,
    });
    // A forward's carried-over attachment is always tied to the forwarded
    // message, never to the draft itself.
    expect(body.draft.attachments[0]?.providerMessageId).not.toBeNull();
  });

  test('409s with the existing draft (same envelope a create returns) when the thread already has a non-terminal draft', async () => {
    const { cookieHeader, accountId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });

    const first = await app.request('/email/draft', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'reply',
        threadId: seeded.thread.id,
        replyToMessageId: seeded.messageId,
      }),
    });
    expect(first.status).toBe(StatusCodes.CREATED);
    const firstBody = z
      .object({ draft: z.object({ id: z.string(), kind: z.string() }) })
      .parse(await first.json());

    const second = await app.request('/email/draft', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'reply',
        threadId: seeded.thread.id,
        replyToMessageId: seeded.messageId,
      }),
    });

    expect(second.status).toBe(StatusCodes.CONFLICT);
    const secondBody = z
      .object({ draft: z.object({ id: z.string(), kind: z.string() }) })
      .parse(await second.json());
    expect(secondBody.draft.id).toBe(firstBody.draft.id);
    expect(secondBody.draft.kind).toBe('reply');
  });
});

describe('GET /email/draft/:draftId', () => {
  test('returns the draft by id', async () => {
    const { cookieHeader, accountId, agentId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });
    const draft = await seedEmailDraft({ accountId, threadId: seeded.thread.id, agentId });

    const response = await app.request(`/email/draft/${draft.id}`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = z.object({ draft: draftSchema }).parse(await response.json());
    expect(body.draft.id).toBe(draft.id);
  });

  test('404s for a draft on another account', async () => {
    const { cookieHeader } = await connectAccountWithAgent();
    const other = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId: other.accountId });
    const draft = await seedEmailDraft({
      accountId: other.accountId,
      threadId: seeded.thread.id,
      agentId: other.agentId,
    });

    const response = await app.request(`/email/draft/${draft.id}`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('PATCH /email/draft/:draftId - widened editable set', () => {
  test('accepts to, cc, bcc, subject together with content', async () => {
    const { cookieHeader, accountId, agentId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });
    const draft = await seedEmailDraft({ accountId, threadId: seeded.thread.id, agentId });

    const response = await app.request(`/email/draft/${draft.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        to: [{ name: 'A', email: 'a@example.test' }],
        cc: [{ name: null, email: 'b@example.test' }],
        subject: 'New subject',
      }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = z
      .object({
        draft: z.object({
          to: z.array(z.object({ name: z.string().nullable(), email: z.string() })),
          cc: z.array(z.object({ name: z.string().nullable(), email: z.string() })),
          subject: z.string().nullable(),
        }),
      })
      .parse(await response.json());
    expect(body.draft.to).toEqual([{ name: 'A', email: 'a@example.test' }]);
    expect(body.draft.cc).toEqual([{ name: null, email: 'b@example.test' }]);
    expect(body.draft.subject).toBe('New subject');
  });

  test('accepts and persists `text` alongside `content`', async () => {
    const { cookieHeader, accountId, agentId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });
    const draft = await seedEmailDraft({ accountId, threadId: seeded.thread.id, agentId });

    const response = await app.request(`/email/draft/${draft.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ content: '<p>Edited reply body.</p>', text: 'Edited reply body.' }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = z
      .object({ draft: z.object({ content: z.string(), text: z.string() }) })
      .parse(await response.json());
    expect(body.draft.content).toBe('<p>Edited reply body.</p>');
    expect(body.draft.text).toBe('Edited reply body.');
  });

  test('422s when the body includes a creation-only field (origin)', async () => {
    const { cookieHeader, accountId, agentId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });
    const draft = await seedEmailDraft({ accountId, threadId: seeded.thread.id, agentId });

    const response = await app.request(`/email/draft/${draft.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'Edited', origin: 'ai' }),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  test('422s when the body includes a creation-only field (threadId)', async () => {
    const { cookieHeader, accountId, agentId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });
    const draft = await seedEmailDraft({ accountId, threadId: seeded.thread.id, agentId });

    const response = await app.request(`/email/draft/${draft.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'Edited', threadId: seeded.thread.id }),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });
});

describe('PATCH /email/draft/:draftId - draft-only attachment write-back', () => {
  test('an attachment with a null providerMessageId is fetched via getDraftAttachment, not getAttachment', async () => {
    const { cookieHeader, accountId, agentId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });
    const draft = await seedEmailDraft({
      accountId,
      threadId: seeded.thread.id,
      agentId,
      to: [{ name: null, email: 'someone@example.test' }],
      providerDraftId: 'gmail-draft-attach-1',
      attachments: [
        {
          // Null: this attachment lives on the Gmail draft itself (synced
          // in from Gmail web/mobile), not on a forwarded message.
          providerMessageId: null,
          providerAttachmentId: 'gmail-att-1',
          filename: 'inline.png',
          mimeType: 'image/png',
          size: 10,
          contentId: 'cid123',
          inline: true,
        },
      ],
    });

    const response = await app.request(`/email/draft/${draft.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      // A draft carrying attachments only writes back when the client
      // explicitly asks for it (`flush`), never on an implicit signal.
      body: JSON.stringify({ attachments: draft.attachments, flush: true }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(getDraftAttachmentMock).toHaveBeenCalledTimes(1);
    expect(getDraftAttachmentMock.mock.calls[0]).toEqual(['gmail-draft-attach-1', 'gmail-att-1']);
    expect(getAttachmentMock).not.toHaveBeenCalled();
  });

  test('a draft with attachments does NOT write back on a body-only save without `flush`', async () => {
    const { cookieHeader, accountId, agentId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });
    const draft = await seedEmailDraft({
      accountId,
      threadId: seeded.thread.id,
      agentId,
      to: [{ name: null, email: 'someone@example.test' }],
      providerDraftId: 'gmail-draft-attach-2',
      attachments: [
        {
          providerMessageId: null,
          providerAttachmentId: 'gmail-att-2',
          filename: 'inline.png',
          mimeType: 'image/png',
          size: 10,
          contentId: null,
          inline: false,
        },
      ],
    });

    const response = await app.request(`/email/draft/${draft.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'Just typing, no flush.' }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(getDraftAttachmentMock).not.toHaveBeenCalled();
    expect(updateDraftMock).not.toHaveBeenCalled();
  });

  test('`flush: true` forces the write-back even on a body-only save', async () => {
    const { cookieHeader, accountId, agentId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });
    const draft = await seedEmailDraft({
      accountId,
      threadId: seeded.thread.id,
      agentId,
      to: [{ name: null, email: 'someone@example.test' }],
      providerDraftId: 'gmail-draft-attach-3',
      attachments: [
        {
          providerMessageId: null,
          providerAttachmentId: 'gmail-att-3',
          filename: 'inline.png',
          mimeType: 'image/png',
          size: 10,
          contentId: null,
          inline: false,
        },
      ],
    });

    const response = await app.request(`/email/draft/${draft.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'Panel is closing.', flush: true }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(updateDraftMock).toHaveBeenCalledTimes(1);
    expect(updateDraftMock.mock.calls[0]?.[0]).toBe('gmail-draft-attach-3');
  });
});

describe('POST /email/draft/:draftId/send - providerDraftId set', () => {
  test('flushes the final content with updateDraft, then sendDraft (never plain send)', async () => {
    const { cookieHeader, accountId, agentId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });
    const draft = await seedEmailDraft({
      accountId,
      threadId: seeded.thread.id,
      agentId,
      replyToMessageId: seeded.messageId,
      status: 'ready',
      providerDraftId: 'gmail-draft-send-1',
    });

    const formData = buildFormData({
      to: 'recipient@example.test',
      subject: 'Re: Hello',
      text: 'Final content before sending.',
    });

    const response = await app.request(`/email/draft/${draft.id}/send`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
      body: formData,
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    expect(updateDraftMock).toHaveBeenCalledTimes(1);
    expect(updateDraftMock.mock.calls[0]?.[0]).toBe('gmail-draft-send-1');
    expect(sendDraftMock).toHaveBeenCalledTimes(1);
    expect(sendDraftMock.mock.calls[0]?.[0]).toBe('gmail-draft-send-1');
    expect(sendMock).not.toHaveBeenCalled();

    const draftsResponse = await app.request(`/email/draft?threadId=${seeded.thread.id}`, {
      headers: { cookie: cookieHeader },
    });
    const draftsBody = z
      .object({
        drafts: z.array(
          z.object({ id: z.string(), status: z.string(), providerDraftId: z.string().nullable() }),
        ),
      })
      .parse(await draftsResponse.json());
    const updated = draftsBody.drafts.find((d) => d.id === draft.id);
    expect(updated?.status).toBe('sent');
    expect(updated?.providerDraftId).toBeNull();
  });

  test('uses the regular send path (no updateDraft/sendDraft) when providerDraftId is null', async () => {
    const { cookieHeader, accountId, agentId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });
    const draft = await seedEmailDraft({
      accountId,
      threadId: seeded.thread.id,
      agentId,
      replyToMessageId: seeded.messageId,
      status: 'ready',
    });

    const formData = buildFormData({
      to: 'recipient@example.test',
      subject: 'Re: Hello',
      text: 'Body',
    });

    const response = await app.request(`/email/draft/${draft.id}/send`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
      body: formData,
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(updateDraftMock).not.toHaveBeenCalled();
    expect(sendDraftMock).not.toHaveBeenCalled();
  });
});

describe('GET /email/thread - DRAFT exclusion', () => {
  test('a message carrying the DRAFT label is excluded from inbox and the default (no-folder) view', async () => {
    const { cookieHeader, accountId } = await connectAccountWithAgent();
    const ordinary = await seedEmailThreadWithMessage({ accountId, labelIds: ['INBOX'] });
    await seedEmailThreadWithMessage({ accountId, labelIds: ['INBOX', 'DRAFT'] });

    const inboxResponse = await app.request('/email/thread?folder=inbox', {
      headers: { cookie: cookieHeader },
    });
    const inboxBody = z
      .object({ threads: z.array(z.object({ id: z.string() })) })
      .parse(await inboxResponse.json());
    expect(inboxBody.threads.map((t) => t.id)).toEqual([ordinary.thread.id]);

    const defaultResponse = await app.request('/email/thread', {
      headers: { cookie: cookieHeader },
    });
    const defaultBody = z
      .object({ threads: z.array(z.object({ id: z.string() })) })
      .parse(await defaultResponse.json());
    expect(defaultBody.threads.map((t) => t.id)).toEqual([ordinary.thread.id]);
  });
});

describe('PATCH /email/draft/:draftId - Gmail write-back reads html/text straight off the row', () => {
  test('a push to Gmail carries `content` as the html part and `text` as the text part, unconverted', async () => {
    const { cookieHeader, accountId, agentId } = await connectAccountWithAgent();
    const seeded = await seedEmailThreadWithMessage({ accountId });
    const draft = await seedEmailDraft({
      accountId,
      threadId: seeded.thread.id,
      agentId,
      content: '',
      text: '',
    });

    const response = await app.request(`/email/draft/${draft.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        content: '<p><strong>Bold</strong> reply text.</p>',
        text: 'Bold reply text.',
      }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    // No providerDraftId yet on this draft, so the write-back creates one.
    expect(createDraftMock).toHaveBeenCalledTimes(1);
    const input = createDraftMock.mock.calls[0]?.[0] as { html?: string; text?: string };
    // No markdownToHtml conversion at write-back time: `content` is already
    // HTML and is passed straight through as the `html` MIME part.
    expect(input.html).toBe('<p><strong>Bold</strong> reply text.</p>');
    expect(input.text).toBe('Bold reply text.');
  });
});
