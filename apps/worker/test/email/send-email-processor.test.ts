import { INVITATION_EMAIL_JOB, PASSKEY_ADDED_EMAIL_JOB, WELCOME_EMAIL_JOB } from '@repo/queue';
import { resetProviderMocks, sendEmailMock } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { processSendEmailJob } from '../../src/processors/email.processor';
import { buildJob } from '../support/job';

describe('processSendEmailJob', () => {
  beforeEach(() => {
    resetProviderMocks();
  });

  test('welcome job sends the welcome email in the job locale', async () => {
    const result = await processSendEmailJob(
      buildJob({
        name: WELCOME_EMAIL_JOB,
        data: { email: 'ada@example.test', name: 'Ada', locale: 'en' },
      }),
    );

    expect(result).toEqual({ success: true });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith({
      to: 'ada@example.test',
      locale: 'en',
      email: { id: 'welcome', variables: { name: 'Ada' } },
    });
  });

  test('invitation job sends the invitation email in the job locale', async () => {
    await processSendEmailJob(
      buildJob({
        name: INVITATION_EMAIL_JOB,
        data: {
          email: 'bob@example.test',
          inviterName: 'Ada',
          organizationName: 'Acme',
          url: 'https://app.example.test/invite/1',
          locale: 'de',
        },
      }),
    );

    expect(sendEmailMock).toHaveBeenCalledWith({
      to: 'bob@example.test',
      locale: 'de',
      email: {
        id: 'invitation',
        variables: {
          inviterName: 'Ada',
          organizationName: 'Acme',
          url: 'https://app.example.test/invite/1',
        },
      },
    });
  });

  test('passkey-added job sends the passkey-added email in the job locale', async () => {
    await processSendEmailJob(
      buildJob({
        name: PASSKEY_ADDED_EMAIL_JOB,
        data: {
          email: 'ada@example.test',
          userName: 'Ada',
          passkeyName: 'MacBook',
          settingsUrl: 'https://app.example.test/settings/passkeys',
          locale: 'en',
        },
      }),
    );

    expect(sendEmailMock).toHaveBeenCalledWith({
      to: 'ada@example.test',
      locale: 'en',
      email: {
        id: 'passkey-added',
        variables: {
          userName: 'Ada',
          passkeyName: 'MacBook',
          settingsUrl: 'https://app.example.test/settings/passkeys',
        },
      },
    });
  });

  test('a job queued without a locale is sent in German', async () => {
    await processSendEmailJob(
      buildJob({ name: WELCOME_EMAIL_JOB, data: { email: 'ada@example.test', name: 'Ada' } }),
    );

    expect(sendEmailMock).toHaveBeenCalledWith({
      to: 'ada@example.test',
      locale: 'de',
      email: { id: 'welcome', variables: { name: 'Ada' } },
    });
  });

  test('passkey-added job with an invalid payload rejects without sending', async () => {
    const job = buildJob({
      name: PASSKEY_ADDED_EMAIL_JOB,
      data: { email: 'ada@example.test', userName: 'Ada' },
    });

    await expect(processSendEmailJob(job)).rejects.toThrow();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  test('the removed verify job name is rejected without sending', async () => {
    const job = buildJob({
      name: 'send-verification-email-job',
      data: { email: 'ada@example.test', url: 'https://app.example.test/verify/1' },
    });

    await expect(processSendEmailJob(job)).rejects.toThrow('Unknown email job');
    expect(sendEmailMock).not.toHaveBeenCalled();
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
