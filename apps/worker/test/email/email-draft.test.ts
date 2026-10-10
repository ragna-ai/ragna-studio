import type { EmailDraft } from '@repo/database';
import {
  deleteAgentById,
  deleteWorkspaceById,
  getAgentsByWorkspaceId,
  getOrganizationIdByUserId,
  listEmailDraftsByAccountId,
  updateEmailAccountSettings,
  upsertEmailThreadByProviderThreadId,
} from '@repo/database';
import { EMAIL_DRAFT_JOB } from '@repo/queue';
import {
  buildFakeMailMessage,
  createDraftMock,
  fetchMessageMock,
  languageModelGenerateMock,
  resetProviderMocks,
  scriptModelOutput,
  seedEmailThreadWithMessage,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { processEmailDraftJob } from '../../src/processors/email-draft.processor';
import {
  seedAgent,
  seedDefaultAgentTemplate,
  seedMailUser,
  type SeededMailUser,
} from '../support/email-fixtures';
import { buildJob } from '../support/job';

interface DraftJobParams {
  mailUser: SeededMailUser;
  threadId: string;
  replyToMessageId: string;
  agentId?: string;
}

function draftJob({ mailUser, threadId, replyToMessageId, agentId }: DraftJobParams) {
  return buildJob({
    name: EMAIL_DRAFT_JOB,
    data: { accountId: mailUser.account.id, threadId, replyToMessageId, agentId },
  });
}

async function listAllDrafts(accountId: string): Promise<EmailDraft[]> {
  return listEmailDraftsByAccountId({
    accountId,
    statuses: ['generating', 'ready', 'discarded', 'sent'],
  });
}

interface SeededDraftScenario {
  mailUser: SeededMailUser;
  threadId: string;
  messageId: string;
  providerMessageId: string;
}

async function seedScenario(): Promise<SeededDraftScenario> {
  const mailUser = await seedMailUser();
  const seeded = await seedEmailThreadWithMessage({
    accountId: mailUser.account.id,
    from: { name: 'Carol', email: 'carol@example.test' },
    subject: 'Lunch?',
    htmlBody: '<p>Shall we have lunch?</p>',
  });

  return {
    mailUser,
    threadId: seeded.thread.id,
    messageId: seeded.messageId,
    providerMessageId: seeded.providerMessageId,
  };
}

describe('processEmailDraftJob', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
    await seedDefaultAgentTemplate();
  });

  test('unknown job name throws', async () => {
    const job = buildJob({ name: 'not-a-real-job', data: {} });

    await expect(processEmailDraftJob(job)).rejects.toThrow(
      'Unknown email-draft job: not-a-real-job',
    );
  });

  test('missing account writes no draft and does not throw', async () => {
    const result = await processEmailDraftJob(
      buildJob({
        name: EMAIL_DRAFT_JOB,
        data: {
          accountId: Bun.randomUUIDv7(),
          threadId: Bun.randomUUIDv7(),
          replyToMessageId: Bun.randomUUIDv7(),
        },
      }),
    );

    expect(result).toEqual({ success: true });
    expect(languageModelGenerateMock).not.toHaveBeenCalled();
  });

  describe('happy path', () => {
    test('writes a ready reply draft and pushes it to the provider', async () => {
      const scenario = await seedScenario();
      const agent = await seedAgent({
        userId: scenario.mailUser.userId,
        workspaceId: scenario.mailUser.personalWorkspaceId,
      });
      await updateEmailAccountSettings({
        id: scenario.mailUser.account.id,
        defaultAgentId: agent.id,
      });
      scriptModelOutput({ text: 'Sounds good, **see you at noon**.' });
      fetchMessageMock.mockResolvedValueOnce(
        buildFakeMailMessage({
          id: scenario.providerMessageId,
          messageIdHeader: '<original@mail.test>',
          references: ['<root@mail.test>'],
        }),
      );
      createDraftMock.mockResolvedValueOnce({
        id: 'provider-draft-1',
        threadId: 'provider-thread',
        to: [],
        cc: [],
        bcc: [],
        subject: 'Re: Lunch?',
        snippet: '',
        date: new Date(),
        body: { text: '', html: null, attachments: [] },
      });

      const result = await processEmailDraftJob(
        draftJob({ ...scenario, replyToMessageId: scenario.messageId }),
      );

      expect(result).toEqual({ success: true });
      const [draft] = await listAllDrafts(scenario.mailUser.account.id);
      expect(draft?.status).toBe('ready');
      expect(draft?.origin).toBe('ai');
      expect(draft?.kind).toBe('reply');
      expect(draft?.agentId).toBe(agent.id);
      expect(draft?.replyToMessageId).toBe(scenario.messageId);
      expect(draft?.content).toContain('<strong>see you at noon</strong>');
      expect(draft?.subject).toBe('Re: Lunch?');
      expect(draft?.to).toEqual([{ name: 'Carol', email: 'carol@example.test' }]);
      expect(draft?.quotedHtml).toContain('Shall we have lunch?');
      expect(draft?.providerDraftId).toBe('provider-draft-1');
      expect(createDraftMock).toHaveBeenCalledTimes(1);
      const pushed = createDraftMock.mock.calls[0]?.[0];
      expect(pushed?.subject).toBe('Re: Lunch?');
      expect(pushed?.to).toEqual([{ name: 'Carol', address: 'carol@example.test' }]);
      expect(pushed?.thread?.inReplyToMessageId).toBe('<original@mail.test>');
      expect(pushed?.thread?.references).toEqual(['<root@mail.test>']);
    });

    test('a provider push failure keeps the draft ready without a provider id', async () => {
      const scenario = await seedScenario();
      scriptModelOutput({ text: 'Yes.' });
      createDraftMock.mockRejectedValueOnce(new Error('provider down'));

      const result = await processEmailDraftJob(
        draftJob({ ...scenario, replyToMessageId: scenario.messageId }),
      );

      expect(result).toEqual({ success: true });
      const [draft] = await listAllDrafts(scenario.mailUser.account.id);
      expect(draft?.status).toBe('ready');
      expect(draft?.providerDraftId).toBeNull();
    });

    test('a reply-to message without a Message-ID header is not pushed', async () => {
      const scenario = await seedScenario();
      scriptModelOutput({ text: 'Yes.' });
      fetchMessageMock.mockResolvedValueOnce(
        buildFakeMailMessage({ id: scenario.providerMessageId, messageIdHeader: null }),
      );

      await processEmailDraftJob(draftJob({ ...scenario, replyToMessageId: scenario.messageId }));

      const [draft] = await listAllDrafts(scenario.mailUser.account.id);
      expect(draft?.status).toBe('ready');
      expect(createDraftMock).not.toHaveBeenCalled();
    });
  });

  describe('agent resolution', () => {
    test('the override agent wins over the account default', async () => {
      const scenario = await seedScenario();
      const { userId, personalWorkspaceId, account } = scenario.mailUser;
      const defaultAgent = await seedAgent({
        userId,
        workspaceId: personalWorkspaceId,
        name: 'Default',
      });
      const overrideAgent = await seedAgent({
        userId,
        workspaceId: personalWorkspaceId,
        name: 'Override',
      });
      await updateEmailAccountSettings({ id: account.id, defaultAgentId: defaultAgent.id });
      scriptModelOutput({ text: 'Reply.' });

      await processEmailDraftJob(
        draftJob({ ...scenario, replyToMessageId: scenario.messageId, agentId: overrideAgent.id }),
      );

      const [draft] = await listAllDrafts(account.id);
      expect(draft?.agentId).toBe(overrideAgent.id);
    });

    test('the account default is used when there is no override', async () => {
      const scenario = await seedScenario();
      const { userId, personalWorkspaceId, account } = scenario.mailUser;
      const defaultAgent = await seedAgent({ userId, workspaceId: personalWorkspaceId });
      await updateEmailAccountSettings({ id: account.id, defaultAgentId: defaultAgent.id });
      scriptModelOutput({ text: 'Reply.' });

      await processEmailDraftJob(draftJob({ ...scenario, replyToMessageId: scenario.messageId }));

      const [draft] = await listAllDrafts(account.id);
      expect(draft?.agentId).toBe(defaultAgent.id);
    });

    test('an override outside the personal workspace is ignored in favor of the default', async () => {
      const scenario = await seedScenario();
      const { userId, personalWorkspaceId, sharedWorkspaceId, account } = scenario.mailUser;
      const defaultAgent = await seedAgent({ userId, workspaceId: personalWorkspaceId });
      const sharedAgent = await seedAgent({ userId, workspaceId: sharedWorkspaceId });
      await updateEmailAccountSettings({ id: account.id, defaultAgentId: defaultAgent.id });
      scriptModelOutput({ text: 'Reply.' });

      await processEmailDraftJob(
        draftJob({ ...scenario, replyToMessageId: scenario.messageId, agentId: sharedAgent.id }),
      );

      const [draft] = await listAllDrafts(account.id);
      expect(draft?.agentId).toBe(defaultAgent.id);
    });

    test('a shared-workspace default is never used, the personal default agent takes over', async () => {
      const scenario = await seedScenario();
      const { userId, personalWorkspaceId, sharedWorkspaceId, account } = scenario.mailUser;
      const sharedAgent = await seedAgent({ userId, workspaceId: sharedWorkspaceId });
      await updateEmailAccountSettings({ id: account.id, defaultAgentId: sharedAgent.id });
      scriptModelOutput({ text: 'Reply.' });

      await processEmailDraftJob(draftJob({ ...scenario, replyToMessageId: scenario.messageId }));

      const [draft] = await listAllDrafts(account.id);
      expect(draft?.agentId).not.toBe(sharedAgent.id);
      const [personalDefault] = await getAgentsByWorkspaceId({ workspaceId: personalWorkspaceId });
      expect(draft?.agentId).toBe(personalDefault?.id ?? null);
      expect(personalDefault?.isDefault).toBe(true);
    });

    test('a deleted default agent falls back to the personal default agent', async () => {
      const scenario = await seedScenario();
      const { userId, personalWorkspaceId, account } = scenario.mailUser;
      const doomed = await seedAgent({ userId, workspaceId: personalWorkspaceId });
      await updateEmailAccountSettings({ id: account.id, defaultAgentId: doomed.id });
      await deleteAgentById({ agentId: doomed.id, workspaceId: personalWorkspaceId });
      scriptModelOutput({ text: 'Reply.' });

      await processEmailDraftJob(draftJob({ ...scenario, replyToMessageId: scenario.messageId }));

      const [draft] = await listAllDrafts(account.id);
      expect(draft?.status).toBe('ready');
      expect(draft?.agentId).not.toBe(doomed.id);
      expect(draft?.agentId).not.toBeNull();
    });

    test('a user without a personal workspace gets no draft and no throw', async () => {
      const scenario = await seedScenario();
      const organizationId = await getOrganizationIdByUserId({ userId: scenario.mailUser.userId });
      await deleteWorkspaceById({
        id: scenario.mailUser.personalWorkspaceId,
        organizationId: organizationId ?? '',
      });

      const result = await processEmailDraftJob(
        draftJob({ ...scenario, replyToMessageId: scenario.messageId }),
      );

      expect(result).toEqual({ success: true });
      expect(await listAllDrafts(scenario.mailUser.account.id)).toHaveLength(0);
      expect(languageModelGenerateMock).not.toHaveBeenCalled();
    });
  });

  describe('agent failure', () => {
    test('a model error discards the draft and does not throw', async () => {
      const scenario = await seedScenario();
      languageModelGenerateMock.mockImplementationOnce(() =>
        Promise.reject(new Error('model down')),
      );

      const result = await processEmailDraftJob(
        draftJob({ ...scenario, replyToMessageId: scenario.messageId }),
      );

      expect(result).toEqual({ success: true });
      const [draft] = await listAllDrafts(scenario.mailUser.account.id);
      expect(draft?.status).toBe('discarded');
      expect(createDraftMock).not.toHaveBeenCalled();
    });

    test('a thread without messages discards the draft', async () => {
      const scenario = await seedScenario();
      const emptyThread = await upsertEmailThreadByProviderThreadId({
        accountId: scenario.mailUser.account.id,
        providerThreadId: 'empty-thread',
        subject: 'Empty',
        snippet: '',
        lastMessageAt: new Date(),
        participants: [],
      });

      await processEmailDraftJob(
        draftJob({ ...scenario, threadId: emptyThread.id, replyToMessageId: scenario.messageId }),
      );

      const [draft] = await listAllDrafts(scenario.mailUser.account.id);
      expect(draft?.status).toBe('discarded');
    });
  });
});
