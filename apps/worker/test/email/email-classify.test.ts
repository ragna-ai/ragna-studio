import {
  addEmailAutoDraftSender,
  createEmailCategory,
  getEmailAccountById,
  getEmailMessageById,
} from '@repo/database';
import type { EmailCategory } from '@repo/database';
import { MailProviderError } from '@repo/mail/provider';
import { EMAIL_CLASSIFY_JOB, EMAIL_DRAFT_JOB } from '@repo/queue';
import {
  fetchMessageMock,
  languageModelGenerateMock,
  lastCreatedModel,
  enqueuedJobs,
  queueAddMock,
  resetProviderMocks,
  scriptModelOutput,
  seedEmailThreadWithMessage,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { processEmailClassifyJob } from '../../src/processors/email-classify.processor';
import { seedMailUser } from '../support/email-fixtures';
import { buildJob } from '../support/job';

function classifyJob({ accountId, messageId }: { accountId: string; messageId: string }) {
  return buildJob({ name: EMAIL_CLASSIFY_JOB, data: { accountId, messageId } });
}

function scriptCategory(category: string): void {
  scriptModelOutput({ text: JSON.stringify({ category }) });
}

function seedCategory({
  accountId,
  name,
  autoDraft = false,
}: {
  accountId: string;
  name: string;
  autoDraft?: boolean;
}): Promise<EmailCategory> {
  return createEmailCategory({
    accountId,
    name,
    description: `${name} emails`,
    color: '#336699',
    autoDraft,
  });
}

describe('processEmailClassifyJob', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('unknown job name throws', async () => {
    const job = buildJob({ name: 'not-a-real-job', data: {} });

    await expect(processEmailClassifyJob(job)).rejects.toThrow(
      'Unknown email-classify job: not-a-real-job',
    );
  });

  test('missing message is skipped without calling the model', async () => {
    const { account } = await seedMailUser();

    const result = await processEmailClassifyJob(
      classifyJob({ accountId: account.id, messageId: Bun.randomUUIDv7() }),
    );

    expect(result).toEqual({ success: true });
    expect(languageModelGenerateMock).not.toHaveBeenCalled();
  });

  test('scripted category is stored on the message and no draft is queued', async () => {
    const { account } = await seedMailUser();
    const invoices = await seedCategory({ accountId: account.id, name: 'Invoices' });
    await seedCategory({ accountId: account.id, name: 'Newsletters' });
    const { messageId } = await seedEmailThreadWithMessage({ accountId: account.id });
    scriptCategory('Invoices');

    await processEmailClassifyJob(classifyJob({ accountId: account.id, messageId }));

    const message = await getEmailMessageById({ id: messageId });
    expect(message?.categoryId).toBe(invoices.id);
    expect(message?.needsReply).toBe(false);
    expect(enqueuedJobs(EMAIL_DRAFT_JOB)).toHaveLength(0);
    expect(lastCreatedModel('language')?.modelId).toBe('claude-haiku-4-5');
  });

  test('the prompt lists the categories and the email', async () => {
    const { account } = await seedMailUser();
    await seedCategory({ accountId: account.id, name: 'Invoices' });
    const { messageId } = await seedEmailThreadWithMessage({
      accountId: account.id,
      subject: 'March invoice',
      textBody: 'Please pay by Friday.',
      htmlBody: '<p>Please pay by Friday.</p>',
    });
    scriptCategory('NONE');

    await processEmailClassifyJob(classifyJob({ accountId: account.id, messageId }));

    const calls = languageModelGenerateMock.mock.calls.map((call) => JSON.stringify(call));
    expect(calls.join('')).toContain('Invoices: Invoices emails');
    expect(calls.join('')).toContain('March invoice');
    expect(calls.join('')).toContain('Please pay by Friday.');
  });

  test('NONE leaves the message uncategorized', async () => {
    const { account } = await seedMailUser();
    await seedCategory({ accountId: account.id, name: 'Invoices' });
    const { messageId } = await seedEmailThreadWithMessage({ accountId: account.id });
    scriptCategory('NONE');

    await processEmailClassifyJob(classifyJob({ accountId: account.id, messageId }));

    const message = await getEmailMessageById({ id: messageId });
    expect(message?.categoryId).toBeNull();
    expect(enqueuedJobs(EMAIL_DRAFT_JOB)).toHaveLength(0);
  });

  test('an account without categories skips the model', async () => {
    const { account } = await seedMailUser();
    const { messageId } = await seedEmailThreadWithMessage({ accountId: account.id });

    await processEmailClassifyJob(classifyJob({ accountId: account.id, messageId }));

    expect(languageModelGenerateMock).not.toHaveBeenCalled();
    expect(enqueuedJobs(EMAIL_DRAFT_JOB)).toHaveLength(0);
  });

  test('an auto-draft category marks needsReply and enqueues a draft job', async () => {
    const { account } = await seedMailUser();
    const support = await seedCategory({
      accountId: account.id,
      name: 'Support',
      autoDraft: true,
    });
    const { messageId, thread } = await seedEmailThreadWithMessage({ accountId: account.id });
    scriptCategory('Support');

    await processEmailClassifyJob(classifyJob({ accountId: account.id, messageId }));

    const message = await getEmailMessageById({ id: messageId });
    expect(message?.categoryId).toBe(support.id);
    expect(message?.needsReply).toBe(true);
    expect(enqueuedJobs(EMAIL_DRAFT_JOB)).toHaveLength(1);
    expect(queueAddMock).toHaveBeenCalledWith(EMAIL_DRAFT_JOB, {
      accountId: account.id,
      threadId: thread.id,
      replyToMessageId: messageId,
    });
  });

  test('an auto-draft sender triggers a draft even without a matching category', async () => {
    const { account } = await seedMailUser();
    await seedCategory({ accountId: account.id, name: 'Invoices' });
    await addEmailAutoDraftSender({ accountId: account.id, senderEmail: 'vip@example.test' });
    const { messageId } = await seedEmailThreadWithMessage({
      accountId: account.id,
      from: { name: 'VIP', email: 'vip@example.test' },
    });
    scriptCategory('NONE');

    await processEmailClassifyJob(classifyJob({ accountId: account.id, messageId }));

    const message = await getEmailMessageById({ id: messageId });
    expect(message?.categoryId).toBeNull();
    expect(message?.needsReply).toBe(true);
    expect(enqueuedJobs(EMAIL_DRAFT_JOB)).toHaveLength(1);
  });

  test('a model failure leaves the message uncategorized and does not throw', async () => {
    const { account } = await seedMailUser();
    await seedCategory({ accountId: account.id, name: 'Invoices' });
    const { messageId } = await seedEmailThreadWithMessage({ accountId: account.id });
    languageModelGenerateMock.mockImplementationOnce(() => Promise.reject(new Error('model down')));

    const result = await processEmailClassifyJob(classifyJob({ accountId: account.id, messageId }));

    expect(result).toEqual({ success: true });
    const message = await getEmailMessageById({ id: messageId });
    expect(message?.categoryId).toBeNull();
    expect(message?.needsReply).toBe(false);
  });

  test('a missing body is fetched from the provider before classifying', async () => {
    const { account } = await seedMailUser();
    await seedCategory({ accountId: account.id, name: 'Invoices' });
    const { messageId } = await seedEmailThreadWithMessage({
      accountId: account.id,
      withBody: false,
    });
    scriptCategory('Invoices');

    await processEmailClassifyJob(classifyJob({ accountId: account.id, messageId }));

    expect(fetchMessageMock).toHaveBeenCalledTimes(1);
    const message = await getEmailMessageById({ id: messageId });
    expect(message?.categoryId).not.toBeNull();
  });

  test('a mail auth error while fetching the body flags reauth_required and skips', async () => {
    const { account } = await seedMailUser();
    await seedCategory({ accountId: account.id, name: 'Invoices', autoDraft: true });
    const { messageId } = await seedEmailThreadWithMessage({
      accountId: account.id,
      withBody: false,
    });
    fetchMessageMock.mockRejectedValueOnce(new MailProviderError('unauthorized', 401));

    const result = await processEmailClassifyJob(classifyJob({ accountId: account.id, messageId }));

    expect(result).toEqual({ success: true });
    expect(languageModelGenerateMock).not.toHaveBeenCalled();
    expect(enqueuedJobs(EMAIL_DRAFT_JOB)).toHaveLength(0);
    const synced = await getEmailAccountById({ id: account.id });
    expect(synced?.syncState).toBe('reauth_required');
  });

  test('a non-auth provider error while fetching the body fails the job', async () => {
    const { account } = await seedMailUser();
    const { messageId } = await seedEmailThreadWithMessage({
      accountId: account.id,
      withBody: false,
    });
    fetchMessageMock.mockRejectedValueOnce(new MailProviderError('upstream down', 503));

    await expect(
      processEmailClassifyJob(classifyJob({ accountId: account.id, messageId })),
    ).rejects.toThrow('upstream down');
  });
});
