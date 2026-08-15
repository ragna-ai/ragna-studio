// packages/mail/src/provider/gmail/gmail.sync.ts
//
// Reduces a page (or several, across pagination) of `users.history.list`
// records into one change per affected message. Gmail can report the same
// message multiple times across `messagesAdded` / `labelsAdded` /
// `labelsRemoved` within a single history window; a message that both
// arrived and had its labels changed since the cursor should surface once,
// as `added`, carrying the latest label snapshot.

import type { GmailHistoryListResponse, GmailHistoryMessageStub } from './gmail.types';

export interface GmailAggregatedChange {
  type: 'added' | 'flagsChanged' | 'deleted';
  messageId: string;
  threadId: string;
  labelIds: string[];
}

export function aggregateHistoryPage(
  page: GmailHistoryListResponse,
  changes: Map<string, GmailAggregatedChange>,
): void {
  for (const record of page.history ?? []) {
    for (const added of record.messagesAdded ?? []) {
      changes.set(added.message.id, toAggregatedChange('added', added.message));
    }

    for (const labelAdded of record.labelsAdded ?? []) {
      upsertFlagsChanged(changes, labelAdded.message);
    }

    for (const labelRemoved of record.labelsRemoved ?? []) {
      upsertFlagsChanged(changes, labelRemoved.message);
    }

    for (const deleted of record.messagesDeleted ?? []) {
      changes.set(deleted.message.id, toAggregatedChange('deleted', deleted.message));
    }
  }
}

function upsertFlagsChanged(
  changes: Map<string, GmailAggregatedChange>,
  message: GmailHistoryMessageStub,
): void {
  const existing = changes.get(message.id);

  // A message already classified as newly-added or deleted keeps that
  // classification; refresh its label snapshot to the latest one seen.
  if (existing) {
    existing.labelIds = message.labelIds ?? [];
    return;
  }

  changes.set(message.id, toAggregatedChange('flagsChanged', message));
}

function toAggregatedChange(
  type: GmailAggregatedChange['type'],
  message: GmailHistoryMessageStub,
): GmailAggregatedChange {
  return {
    type,
    messageId: message.id,
    threadId: message.threadId,
    labelIds: message.labelIds ?? [],
  };
}
