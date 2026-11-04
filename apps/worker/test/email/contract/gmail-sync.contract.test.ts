import {
  failVendorEndpoint,
  GMAIL_ENDPOINTS,
  GMAIL_MAILBOX,
  GMAIL_NOT_FOUND_BODY,
} from '@repo/testing';
import { runMailSyncContract } from '../../support/mail-sync-contract';

runMailSyncContract({
  name: 'Gmail',
  integrationId: 'gmail',
  threadId: GMAIL_MAILBOX.threadId,
  newMessageId: GMAIL_MAILBOX.newMessageId,
  initialCursor: GMAIL_MAILBOX.historyId,
  isInitialCursor: (cursor) => cursor === GMAIL_MAILBOX.historyId,
  isAdvancedCursor: (cursor) => cursor === GMAIL_MAILBOX.nextHistoryId,
  expireCursor: () =>
    failVendorEndpoint(GMAIL_ENDPOINTS.history, { status: 404, body: GMAIL_NOT_FOUND_BODY }),
  rejectToken: () => failVendorEndpoint(GMAIL_ENDPOINTS.history, { status: 401 }),
});
