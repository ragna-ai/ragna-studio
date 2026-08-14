// packages/mail/src/provider/gmail/gmail.provider.ts
//
// `MailProvider` implementation backed by the Gmail REST API v1. Owns every
// Gmail-specific detail (label ids, history records, MIME part trees); the
// rest of the app only ever sees `../mail-provider` types.
//
// https://developers.google.com/gmail/api/reference/rest

import MailComposer from 'nodemailer/lib/mail-composer';
import type {
  MailAccountProfile,
  MailActionResult,
  MailAddress,
  MailAttachmentContent,
  MailLabel,
  MailMessage,
  MailMessageMetadata,
  MailProvider,
  MailProviderId,
  MailSearchResult,
  MailSyncChange,
  MailSyncOutcome,
  MailThread,
  SendMailInput,
  SendMailResult,
} from '../mail-provider';
import { GmailApiError, gmailRequest } from './gmail.client';
import { toMailMessage, toMailMessageMetadata } from './gmail.parse';
import { aggregateHistoryPage, type GmailAggregatedChange } from './gmail.sync';
import type {
  GmailAttachmentResource,
  GmailHistoryListResponse,
  GmailLabelsListResponse,
  GmailMessageResource,
  GmailMessageSendResponse,
  GmailProfileResource,
  GmailThreadResource,
  GmailThreadsListResponse,
} from './gmail.types';

const LABEL_UNREAD = 'UNREAD';
const LABEL_STARRED = 'STARRED';
const LABEL_INBOX = 'INBOX';

// history.list restricted to the record types syncFromCursor cares about;
// omits `labelAdded`/`labelRemoved` events for labels we don't surface.
const HISTORY_TYPES = ['messageAdded', 'labelAdded', 'labelRemoved', 'messageDeleted'];

const SEARCH_PAGE_SIZE = '50';

export { GmailApiError } from './gmail.client';

export interface GmailProviderOptions {
  /** Resolves a fresh, valid Gmail OAuth access token; the provider does not refresh or cache tokens. */
  getAccessToken: () => Promise<string>;
}

export class GmailProvider implements MailProvider {
  private readonly getAccessToken: () => Promise<string>;
  private cachedEmailAddress: string | undefined;

  constructor(options: GmailProviderOptions) {
    this.getAccessToken = options.getAccessToken;
  }

  async getProfile(): Promise<MailAccountProfile> {
    const profile = await this.request<GmailProfileResource>('users/me/profile');
    return { emailAddress: profile.emailAddress, cursor: profile.historyId };
  }

  async syncFromCursor(cursor: string): Promise<MailSyncOutcome> {
    const aggregated = new Map<string, GmailAggregatedChange>();
    let nextCursor = cursor;
    let pageToken: string | undefined;

    do {
      const page = await this.fetchHistoryPage(cursor, pageToken);

      if (page === null) {
        return { status: 'cursorExpired' };
      }

      aggregateHistoryPage(page, aggregated);
      if (page.historyId) {
        nextCursor = page.historyId;
      }
      pageToken = page.nextPageToken;
    } while (pageToken);

    const changes = await this.resolveChanges(aggregated);
    return { status: 'ok', changes, nextCursor };
  }

  async fetchThread(threadId: MailProviderId): Promise<MailThread> {
    const raw = await this.request<GmailThreadResource>(`users/me/threads/${threadId}?format=full`);
    return { id: raw.id, messages: raw.messages.map(toMailMessage) };
  }

  fetchMessage(messageId: MailProviderId, format: 'metadata'): Promise<MailMessageMetadata>;
  fetchMessage(messageId: MailProviderId, format: 'full'): Promise<MailMessage>;
  async fetchMessage(
    messageId: MailProviderId,
    format: 'metadata' | 'full',
  ): Promise<MailMessageMetadata | MailMessage> {
    const raw = await this.request<GmailMessageResource>(`users/me/messages/${messageId}?format=${format}`);
    return format === 'full' ? toMailMessage(raw) : toMailMessageMetadata(raw);
  }

  async send(input: SendMailInput): Promise<SendMailResult> {
    const raw = await this.buildOutgoingRaw(input);
    const body: { raw: string; threadId?: string } = { raw };
    if (input.thread) {
      body.threadId = input.thread.threadId;
    }

    const sent = await this.request<GmailMessageSendResponse>('users/me/messages/send', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return { messageId: sent.id, threadId: sent.threadId };
  }

  async setArchived(messageId: MailProviderId, archived: boolean): Promise<MailActionResult> {
    return archived
      ? this.modifyMessage(messageId, [], [LABEL_INBOX])
      : this.modifyMessage(messageId, [LABEL_INBOX], []);
  }

  async trashMessage(messageId: MailProviderId): Promise<MailActionResult> {
    const trashed = await this.request<GmailMessageResource>(`users/me/messages/${messageId}/trash`, {
      method: 'POST',
    });
    return toMailActionResult(trashed);
  }

  async setStarred(messageId: MailProviderId, starred: boolean): Promise<MailActionResult> {
    return starred
      ? this.modifyMessage(messageId, [LABEL_STARRED], [])
      : this.modifyMessage(messageId, [], [LABEL_STARRED]);
  }

  async setRead(messageId: MailProviderId, read: boolean): Promise<MailActionResult> {
    return read
      ? this.modifyMessage(messageId, [], [LABEL_UNREAD])
      : this.modifyMessage(messageId, [LABEL_UNREAD], []);
  }

  async listLabels(): Promise<MailLabel[]> {
    const response = await this.request<GmailLabelsListResponse>('users/me/labels');
    return (response.labels ?? []).map((label) => ({
      id: label.id,
      name: label.name,
      type: label.type === 'system' ? 'system' : 'user',
    }));
  }

  async search(query: string, pageToken?: string | null): Promise<MailSearchResult> {
    const params = new URLSearchParams({ q: query, maxResults: SEARCH_PAGE_SIZE });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const response = await this.request<GmailThreadsListResponse>(`users/me/threads?${params.toString()}`);
    return {
      threadIds: (response.threads ?? []).map((thread) => thread.id),
      nextPageToken: response.nextPageToken ?? null,
    };
  }

  async getAttachment(messageId: MailProviderId, attachmentId: string): Promise<MailAttachmentContent> {
    const response = await this.request<GmailAttachmentResource>(
      `users/me/messages/${messageId}/attachments/${attachmentId}`,
    );
    return { size: response.size, data: Buffer.from(response.data, 'base64url') };
  }

  // --- internals ---------------------------------------------------------

  private request<T>(path: string, options?: { method?: 'GET' | 'POST'; body?: string }): Promise<T> {
    return gmailRequest<T>(this.getAccessToken, path, options);
  }

  private async fetchHistoryPage(
    startHistoryId: string,
    pageToken: string | undefined,
  ): Promise<GmailHistoryListResponse | null> {
    const params = new URLSearchParams({ startHistoryId });
    for (const type of HISTORY_TYPES) {
      params.append('historyTypes', type);
    }
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    try {
      return await this.request<GmailHistoryListResponse>(`users/me/history?${params.toString()}`);
    } catch (error) {
      // A 404 here means Gmail can no longer resolve startHistoryId (it
      // expires on long-idle accounts): the caller needs a full resync.
      if (error instanceof GmailApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  private async resolveChanges(aggregated: Map<string, GmailAggregatedChange>): Promise<MailSyncChange[]> {
    const changes: MailSyncChange[] = [];

    for (const change of aggregated.values()) {
      if (change.type === 'deleted') {
        changes.push({ type: 'deleted', messageId: change.messageId, threadId: change.threadId });
        continue;
      }

      if (change.type === 'added') {
        const message = await this.fetchMessage(change.messageId, 'metadata');
        changes.push({ type: 'added', message });
        continue;
      }

      changes.push({
        type: 'flagsChanged',
        messageId: change.messageId,
        threadId: change.threadId,
        labelIds: change.labelIds,
        unread: change.labelIds.includes(LABEL_UNREAD),
        starred: change.labelIds.includes(LABEL_STARRED),
      });
    }

    return changes;
  }

  private async modifyMessage(
    messageId: MailProviderId,
    addLabelIds: string[],
    removeLabelIds: string[],
  ): Promise<MailActionResult> {
    const updated = await this.request<GmailMessageResource>(`users/me/messages/${messageId}/modify`, {
      method: 'POST',
      body: JSON.stringify({ addLabelIds, removeLabelIds }),
    });
    return toMailActionResult(updated);
  }

  private async getOwnEmailAddress(): Promise<string> {
    if (!this.cachedEmailAddress) {
      this.cachedEmailAddress = (await this.getProfile()).emailAddress;
    }
    return this.cachedEmailAddress;
  }

  private async buildOutgoingRaw(input: SendMailInput): Promise<string> {
    const from = await this.getOwnEmailAddress();

    const mailOptions: ConstructorParameters<typeof MailComposer>[0] = {
      from,
      to: input.to.map(toNodemailerAddress),
      cc: input.cc?.map(toNodemailerAddress),
      bcc: input.bcc?.map(toNodemailerAddress),
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.mimeType,
        cid: attachment.contentId,
      })),
    };

    if (input.thread) {
      mailOptions.inReplyTo = input.thread.inReplyToMessageId;
      mailOptions.references = [...(input.thread.references ?? []), input.thread.inReplyToMessageId];
    }

    const buffer = await new MailComposer(mailOptions).compile().build();
    return buffer.toString('base64url');
  }
}

function toMailActionResult(raw: GmailMessageResource): MailActionResult {
  const labelIds = raw.labelIds ?? [];
  return {
    messageId: raw.id,
    threadId: raw.threadId,
    labelIds,
    unread: labelIds.includes(LABEL_UNREAD),
    starred: labelIds.includes(LABEL_STARRED),
  };
}

function toNodemailerAddress(address: MailAddress): { name?: string; address: string } {
  return { name: address.name, address: address.address };
}

export function createGmailProvider(options: GmailProviderOptions): GmailProvider {
  return new GmailProvider(options);
}
