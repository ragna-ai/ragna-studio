import { INVITATION_EMAIL_JOB, VERIFY_EMAIL_JOB, WELCOME_EMAIL_JOB } from '@repo/queue';
import { resetProviderMocks, sendEmailMock } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { processSendEmailJob } from '../../src/processors/email.processor';
import { buildJob } from '../support/job';

describe('processSendEmailJob', () => {
  beforeEach(() => {
    resetProviderMocks();
  });

  test('welcome job sends the welcome template with the name', async () => {
    const result = await processSendEmailJob(
      buildJob({ name: WELCOME_EMAIL_JOB, data: { email: 'ada@example.test', name: 'Ada' } }),
    );

    expect(result).toEqual({ success: true });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith({
      to: 'ada@example.test',
      subject: 'Welcome to SaaS App!',
      templateId: 'welcome',
      variables: { name: 'Ada' },
    });
  });

  test('invitation job sends the invitation template with inviter, organization and url', async () => {
    await processSendEmailJob(
      buildJob({
        name: INVITATION_EMAIL_JOB,
        data: {
          email: 'bob@example.test',
          inviterName: 'Ada',
          organizationName: 'Acme',
          url: 'https://app.example.test/invite/1',
        },
      }),
    );

    expect(sendEmailMock).toHaveBeenCalledWith({
      to: 'bob@example.test',
      subject: 'Ada invited you to Acme',
      templateId: 'invitation',
      variables: {
        inviterName: 'Ada',
        organizationName: 'Acme',
        url: 'https://app.example.test/invite/1',
      },
    });
  });

  test('verify job sends the verify template with the url', async () => {
    await processSendEmailJob(
      buildJob({
        name: VERIFY_EMAIL_JOB,
        data: { email: 'ada@example.test', url: 'https://app.example.test/verify/1' },
      }),
    );

    expect(sendEmailMock).toHaveBeenCalledWith({
      to: 'ada@example.test',
      subject: 'Verify your email address',
      templateId: 'verify',
      variables: { url: 'https://app.example.test/verify/1' },
    });
  });

  test('invalid payload rejects without sending', async () => {
    const job = buildJob({ name: WELCOME_EMAIL_JOB, data: { name: 'Ada' } });

    await expect(processSendEmailJob(job)).rejects.toThrow();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  test('unknown job name throws', async () => {
    const job = buildJob({ name: 'not-a-real-job', data: {} });

    await expect(processSendEmailJob(job)).rejects.toThrow('Unknown email job: not-a-real-job');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
