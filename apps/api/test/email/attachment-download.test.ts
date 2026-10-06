import { resetProviderMocks, seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import { app } from '../../src/app';
import { seedConnectedGmailAccount, seedEmailThreadWithMessage } from './support/email-fixtures';
import { resetEmailQueueMock } from './support/email-queue.mock';
import { buildFakeMailMessage, fetchMessageMock, resetMailProviderMock } from './support/mail-provider.mock';

// GET /email/message/:messageId/attachment/:partId: the filename comes from
// the external sender, so the Content-Disposition header must stay well-formed.

beforeEach(async () => {
  await truncateAllTables();
  resetProviderMocks();
  resetMailProviderMock();
  resetEmailQueueMock();
});

describe('GET /email/message/:messageId/attachment/:partId', () => {
  test('a filename with a quote and non-ASCII characters yields a well-formed header', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    const { accountId } = await seedConnectedGmailAccount({ userId, cookieHeader });
    const { messageId } = await seedEmailThreadWithMessage({ accountId });
    fetchMessageMock.mockImplementationOnce((providerMessageId: string) =>
      Promise.resolve(
        buildFakeMailMessage({
          id: providerMessageId,
          body: {
            text: 'Body',
            html: null,
            attachments: [
              {
                partId: 'part-1',
                attachmentId: 'att-1',
                filename: 'My "Résumé".pdf',
                mimeType: 'application/pdf',
                size: 3,
                inline: false,
              },
            ],
          },
        }),
      ),
    );

    const response = await app.request(`/email/message/${messageId}/attachment/part-1`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="My _R_sum__.pdf"; filename*=UTF-8''My%20%22R%C3%A9sum%C3%A9%22.pdf`,
    );
  });
});
