import {
  failVendorEndpoint,
  GRAPH_ENDPOINTS,
  GRAPH_MAILBOX,
  GRAPH_SYNC_STATE_NOT_FOUND_BODY,
  graphDeltaLink,
} from '@repo/testing';
import { runMailSyncContract } from '../../support/mail-sync-contract';

const SYNCED_FOLDERS = ['inbox', 'sentitems', 'deleteditems', 'junkemail', 'archive'] as const;

function cursorWithToken(token: string): string {
  const folders = Object.fromEntries(
    SYNCED_FOLDERS.map((name) => [name, graphDeltaLink(GRAPH_MAILBOX.folderIds[name], token)]),
  );
  return JSON.stringify({ v: 1, folders });
}

function hasDeltaToken(cursor: string | null, token: string): boolean {
  return cursor?.includes(`$deltatoken=${token}`) ?? false;
}

runMailSyncContract({
  name: 'Outlook (Microsoft Graph)',
  integrationId: 'outlook-mail',
  threadId: GRAPH_MAILBOX.conversationId,
  newMessageId: GRAPH_MAILBOX.newMessageId,
  initialCursor: cursorWithToken(GRAPH_MAILBOX.initialDeltaToken),
  isInitialCursor: (cursor) =>
    hasDeltaToken(cursor, GRAPH_MAILBOX.initialDeltaToken) &&
    !hasDeltaToken(cursor, GRAPH_MAILBOX.nextDeltaToken),
  isAdvancedCursor: (cursor) => hasDeltaToken(cursor, GRAPH_MAILBOX.nextDeltaToken),
  expireCursor: () =>
    failVendorEndpoint(GRAPH_ENDPOINTS.folderDelta, {
      status: 410,
      body: GRAPH_SYNC_STATE_NOT_FOUND_BODY,
      times: 1,
    }),
  rejectToken: () => failVendorEndpoint(GRAPH_ENDPOINTS.folder, { status: 401 }),
});
