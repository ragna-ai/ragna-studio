import type { EmailDraft } from '@repo/database';
import {
  createDataset,
  deleteAgentById,
  deleteWorkspaceById,
  getOrganizationIdByUserId,
  listEmailDraftsByAccountId,
  updateEmailAccountSettings,
  upsertMemory,
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
import { seedAgent, seedMailUser, type SeededMailUser } from '../support/email-fixtures';
import { seedReadyDocument } from '../support/generation-fixtures';
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
  const draftAgent = await seedAgent({
    userId: mailUser.userId,
    workspaceId: mailUser.personalWorkspaceId,
  });
  await updateEmailAccountSettings({ id: mailUser.account.id, defaultAgentId: draftAgent.id });
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

    test('a shared-workspace default is never used, no draft is written', async () => {
      const scenario = await seedScenario();
      const { userId, sharedWorkspaceId, account } = scenario.mailUser;
      const sharedAgent = await seedAgent({ userId, workspaceId: sharedWorkspaceId });
      await updateEmailAccountSettings({ id: account.id, defaultAgentId: sharedAgent.id });

      const result = await processEmailDraftJob(
        draftJob({ ...scenario, replyToMessageId: scenario.messageId }),
      );

      expect(result).toEqual({ success: true });
      expect(await listAllDrafts(account.id)).toHaveLength(0);
      expect(languageModelGenerateMock).not.toHaveBeenCalled();
    });

    test('a deleted default agent leaves no agent, so no draft is written', async () => {
      const scenario = await seedScenario();
      const { userId, personalWorkspaceId, account } = scenario.mailUser;
      const doomed = await seedAgent({ userId, workspaceId: personalWorkspaceId });
      await updateEmailAccountSettings({ id: account.id, defaultAgentId: doomed.id });
      await deleteAgentById({ agentId: doomed.id, workspaceId: personalWorkspaceId });

      const result = await processEmailDraftJob(
        draftJob({ ...scenario, replyToMessageId: scenario.messageId }),
      );

      expect(result).toEqual({ success: true });
      expect(await listAllDrafts(account.id)).toHaveLength(0);
      expect(languageModelGenerateMock).not.toHaveBeenCalled();
    });

    test('an account without any agent writes no draft', async () => {
      const scenario = await seedScenario();
      await updateEmailAccountSettings({ id: scenario.mailUser.account.id, defaultAgentId: null });

      const result = await processEmailDraftJob(
        draftJob({ ...scenario, replyToMessageId: scenario.messageId }),
      );

      expect(result).toEqual({ success: true });
      expect(await listAllDrafts(scenario.mailUser.account.id)).toHaveLength(0);
      expect(languageModelGenerateMock).not.toHaveBeenCalled();
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
  describe('untrusted email content', () => {
    function lastModelCall() {
      const call = languageModelGenerateMock.mock.calls.at(-1);
      if (!call) throw new Error('model was not called');
      return call[0];
    }

    function systemText(): string {
      return lastModelCall()
        .prompt.filter((message) => message.role === 'system')
        .map((message) => String(message.content))
        .join('\n');
    }

    async function runDraftWithAgent(
      scenario: SeededDraftScenario,
      agentId: string,
    ): Promise<void> {
      scriptModelOutput({ text: 'ok' });
      await processEmailDraftJob(
        draftJob({ ...scenario, replyToMessageId: scenario.messageId, agentId }),
      );
    }

    test('the model call receives no tools even when the agent has them enabled', async () => {
      const scenario = await seedScenario();
      const agent = await seedAgent({
        userId: scenario.mailUser.userId,
        workspaceId: scenario.mailUser.personalWorkspaceId,
        tools: ['webBrowser', 'datasets', 'memory', 'think'],
      });

      await runDraftWithAgent(scenario, agent.id);

      expect(lastModelCall().tools ?? []).toHaveLength(0);
    });

    test('instructions keep the memory block and drop the pinned dataset', async () => {
      const scenario = await seedScenario();
      const dataset = await createDataset({
        userId: scenario.mailUser.userId,
        workspaceId: scenario.mailUser.personalWorkspaceId,
        name: 'Secret Customers',
      });
      const agent = await seedAgent({
        userId: scenario.mailUser.userId,
        workspaceId: scenario.mailUser.personalWorkspaceId,
        tools: ['datasets', 'memory'],
        defaultDatasetId: dataset.id,
      });
      await upsertMemory({ agentId: agent.id, content: 'Sven prefers short replies.' });

      await runDraftWithAgent(scenario, agent.id);

      const instructions = systemText();
      expect(instructions).toContain('<memory>');
      expect(instructions).toContain('Sven prefers short replies.');
      expect(instructions).not.toContain('<pinned_dataset');
      expect(instructions).not.toContain('Secret Customers');
    });

    test('retrieval mode adds no document index', async () => {
      const scenario = await seedScenario();
      const agent = await seedAgent({
        userId: scenario.mailUser.userId,
        workspaceId: scenario.mailUser.personalWorkspaceId,
        tools: ['documents'],
      });
      await seedReadyDocument({ agentId: agent.id, extractedTextLength: 40_000 });

      await runDraftWithAgent(scenario, agent.id);

      const instructions = systemText();
      expect(instructions).not.toContain('<document_index>');
      expect(instructions).not.toContain('existing.txt');
    });

    test('the task prompt marks the thread as untrusted', async () => {
      const scenario = await seedScenario();
      const agent = await seedAgent({
        userId: scenario.mailUser.userId,
        workspaceId: scenario.mailUser.personalWorkspaceId,
      });
      await runDraftWithAgent(scenario, agent.id);

      const userText = JSON.stringify(
        lastModelCall().prompt.filter((message) => message.role === 'user'),
      );
      expect(userText).toContain('untrusted');
    });
  });
});
