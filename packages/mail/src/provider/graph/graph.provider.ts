import type {
  AttachmentItem,
  FileAttachment,
  MailFolder as GraphMailFolderResource,
  Message,
  OutlookCategory,
  UploadSession,
  User,
} from '@microsoft/microsoft-graph-types';
import type {
  MailAccountProfile,
  MailActionResult,
  MailAttachmentContent,
  MailAttachmentInput,
  MailDraft,
  MailDraftSummary,
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
import {
  GraphApiError,
  graphRequest,
  graphRequestVoid,
  isGraphDeltaExpired,
  putUploadSessionChunk,
  type GraphRequestOptions,
} from './graph.client';
import {
  buildGraphSearchQuery,
  escapeODataStringLiteral,
  requireField,
  toGraphMessagePatch,
  toMailDraft,
  toMailDraftSummary,
  toMailMessage,
  toMailMessageMetadata,
} from './graph.parse';
import { aggregateDeltaPage, type GraphAggregatedChange } from './graph.sync';
import type {
  GraphAttachmentMetadata,
  GraphCreateUploadSessionRequest,
  GraphDeltaMessage,
  GraphDeltaPage,
  GraphFileAttachmentCreate,
  GraphODataCollection,
  GraphSyncCursor,
  GraphSyncedFolderName,
  GraphWellKnownFolderIds,
  GraphWellKnownFolderName,
} from './graph.types';

const METADATA_SELECT_FIELDS = [
  'id',
  'conversationId',
  'from',
  'toRecipients',
  'ccRecipients',
  'bccRecipients',
  'subject',
  'bodyPreview',
  'receivedDateTime',
  'sentDateTime',
  'createdDateTime',
  'categories',
  'parentFolderId',
  'isRead',
  'flag',
  'hasAttachments',
];

const FULL_SELECT_FIELDS = [
  ...METADATA_SELECT_FIELDS,
  'body',
  'internetMessageId',
  'internetMessageHeaders',
];

const DRAFT_SUMMARY_SELECT_FIELDS = [
  'id',
  'conversationId',
  'toRecipients',
  'ccRecipients',
  'bccRecipients',
  'subject',
  'bodyPreview',
  'lastModifiedDateTime',
  'createdDateTime',
];

const DRAFT_FULL_SELECT_FIELDS = [...DRAFT_SUMMARY_SELECT_FIELDS, 'body', 'hasAttachments'];

const WELL_KNOWN_FOLDER_NAMES: GraphWellKnownFolderName[] = [
  'inbox',
  'sentitems',
  'deleteditems',
  'junkemail',
  'drafts',
  'archive',
];

// Drafts aren't delta-synced; listDrafts/getDraft cover them instead.
const SYNCED_FOLDER_NAMES: GraphSyncedFolderName[] = [
  'inbox',
  'sentitems',
  'deleteditems',
  'junkemail',
  'archive',
];

const RECENT_INBOX_PAGE_SIZE = '50';
const SEARCH_PAGE_SIZE = '50';
const INLINE_ATTACHMENT_MAX_BYTES = 3 * 1024 * 1024;
const UPLOAD_CHUNK_SIZE_BYTES = 4 * 1024 * 1024;

export { GraphApiError } from './graph.client';

export interface GraphProviderOptions {
  /** Resolves a fresh, valid Graph OAuth access token; the provider does not refresh or cache tokens. */
  getAccessToken: () => Promise<string>;
}

export class GraphProvider implements MailProvider {
  private readonly getAccessToken: () => Promise<string>;
  private wellKnownFolderIdsPromise: Promise<GraphWellKnownFolderIds> | undefined;

  constructor(options: GraphProviderOptions) {
    this.getAccessToken = options.getAccessToken;
  }

  async getProfile(): Promise<MailAccountProfile> {
    const me = await this.request<User>('me?$select=mail,userPrincipalName');
    const emailAddress = me.mail ?? me.userPrincipalName;
    if (!emailAddress) {
      throw new GraphApiError('Graph /me response has neither mail nor userPrincipalName', 502);
    }
    const cursor: GraphSyncCursor = { v: 1, folders: await this.createCurrentDeltaLinks() };
    return { emailAddress, cursor: JSON.stringify(cursor) };
  }

  // Graph ignores $deltatoken=latest for messages, so the initial delta returns the whole folder; drain it without emitting changes.
  private async createCurrentDeltaLinks(): Promise<GraphSyncCursor['folders']> {
    const wellKnownFolderIds = await this.getWellKnownFolderIds();
    const folders: GraphSyncCursor['folders'] = {};

    for (const folderName of SYNCED_FOLDER_NAMES) {
      const folderId = wellKnownFolderIds[folderName];
      if (!folderId) continue;
      folders[folderName] = await this.drainToDeltaLink(this.initialDeltaLink(folderId));
    }

    return folders;
  }

  private async drainToDeltaLink(startLink: string): Promise<string> {
    let nextUrl: string | undefined = startLink;

    while (nextUrl) {
      const page: GraphDeltaPage<GraphDeltaMessage> =
        await this.request<GraphDeltaPage<GraphDeltaMessage>>(nextUrl);
      const deltaLink = page['@odata.deltaLink'];
      if (deltaLink) return deltaLink;
      nextUrl = page['@odata.nextLink'];
    }

    throw new GraphApiError('Graph delta response has neither nextLink nor deltaLink', 502);
  }

  async syncFromCursor(cursor: string): Promise<MailSyncOutcome> {
    const parsedCursor = parseGraphSyncCursor(cursor);
    const wellKnownFolderIds = await this.getWellKnownFolderIds();
    const nextFolders: GraphSyncCursor['folders'] = {};
    const changesByMessageId = new Map<string, MailSyncChange>();

    for (const folderName of SYNCED_FOLDER_NAMES) {
      const folderId = wellKnownFolderIds[folderName];
      if (!folderId) continue;

      const startLink = parsedCursor.folders[folderName];
      if (!startLink) {
        nextFolders[folderName] = await this.drainToDeltaLink(this.initialDeltaLink(folderId));
        continue;
      }

      const result = await this.syncFolder(startLink, wellKnownFolderIds);
      if (result === 'expired') {
        return { status: 'cursorExpired' };
      }

      nextFolders[folderName] = result.deltaLink;
      for (const change of result.changes) {
        changesByMessageId.set(changeMessageId(change), change);
      }
    }

    const nextCursor: GraphSyncCursor = { v: 1, folders: nextFolders };
    return {
      status: 'ok',
      changes: [...changesByMessageId.values()],
      nextCursor: JSON.stringify(nextCursor),
    };
  }

  async fetchThread(threadId: MailProviderId): Promise<MailThread> {
    const wellKnownFolderIds = await this.getWellKnownFolderIds();
    const params = new URLSearchParams({
      $filter: `conversationId eq '${escapeODataStringLiteral(threadId)}'`,
      $select: FULL_SELECT_FIELDS.join(','),
    });

    const messages: MailMessage[] = [];
    let nextUrl: string | undefined = `me/messages?${params.toString()}`;

    while (nextUrl) {
      const page: GraphODataCollection<Message> = await this.request(nextUrl);
      for (const raw of page.value) {
        const attachments = raw.hasAttachments
          ? await this.fetchAttachmentsMeta(requireField(raw.id, 'id'))
          : [];
        messages.push(toMailMessage(raw, attachments, wellKnownFolderIds));
      }
      nextUrl = page['@odata.nextLink'];
    }

    messages.sort((a, b) => a.date.getTime() - b.date.getTime());
    return { id: threadId, messages };
  }

  fetchMessage(messageId: MailProviderId, format: 'metadata'): Promise<MailMessageMetadata>;
  fetchMessage(messageId: MailProviderId, format: 'full'): Promise<MailMessage>;
  async fetchMessage(
    messageId: MailProviderId,
    format: 'metadata' | 'full',
  ): Promise<MailMessageMetadata | MailMessage> {
    const wellKnownFolderIds = await this.getWellKnownFolderIds();
    const fields = format === 'full' ? FULL_SELECT_FIELDS : METADATA_SELECT_FIELDS;
    const raw = await this.request<Message>(`me/messages/${messageId}?$select=${fields.join(',')}`);

    if (format === 'metadata') {
      return toMailMessageMetadata(raw, wellKnownFolderIds);
    }

    const attachments = raw.hasAttachments ? await this.fetchAttachmentsMeta(messageId) : [];
    return toMailMessage(raw, attachments, wellKnownFolderIds);
  }

  async send(input: SendMailInput): Promise<SendMailResult> {
    const draft = await this.createDraft(input);
    await this.requestVoid(`me/messages/${draft.id}/send`, { method: 'POST' });
    return { messageId: draft.id, threadId: draft.threadId };
  }

  async createDraft(input: SendMailInput): Promise<MailDraft> {
    // The contract can't tell a reply from a forward; always createReply, which keeps the same conversationId.
    const created = input.thread
      ? await this.request<Message>(
          `me/messages/${input.thread.replyToProviderMessageId}/createReply`,
          { method: 'POST' },
        )
      : await this.request<Message>('me/messages', { method: 'POST', body: JSON.stringify({}) });

    const messageId = requireField(created.id, 'id');
    await this.patchMessage(messageId, toGraphMessagePatch(input));
    await this.reconcileAttachments(messageId, input.attachments ?? [], []);
    return this.getDraft(messageId);
  }

  async updateDraft(draftId: MailProviderId, input: SendMailInput): Promise<MailDraft> {
    await this.patchMessage(draftId, toGraphMessagePatch(input));
    const existing = await this.fetchAttachmentsMeta(draftId);
    await this.reconcileAttachments(
      draftId,
      input.attachments ?? [],
      existing.map((attachment) => requireField(attachment.id, 'id')),
    );
    return this.getDraft(draftId);
  }

  async getDraft(draftId: MailProviderId): Promise<MailDraft> {
    const raw = await this.request<Message>(
      `me/messages/${draftId}?$select=${DRAFT_FULL_SELECT_FIELDS.join(',')}`,
    );
    const attachments = raw.hasAttachments ? await this.fetchAttachmentsMeta(draftId) : [];
    return toMailDraft(raw, attachments);
  }

  async listDrafts(): Promise<MailDraftSummary[]> {
    const wellKnownFolderIds = await this.getWellKnownFolderIds();
    const draftsFolderId = this.requireFolderId(wellKnownFolderIds, 'drafts');
    const params = new URLSearchParams({ $select: DRAFT_SUMMARY_SELECT_FIELDS.join(',') });

    const summaries: MailDraftSummary[] = [];
    let nextUrl: string | undefined =
      `me/mailFolders/${draftsFolderId}/messages?${params.toString()}`;

    while (nextUrl) {
      const page: GraphODataCollection<Message> = await this.request(nextUrl);
      summaries.push(...page.value.map(toMailDraftSummary));
      nextUrl = page['@odata.nextLink'];
    }

    return summaries;
  }

  async sendDraft(draftId: MailProviderId): Promise<SendMailResult> {
    const draftBeforeSend = await this.request<Pick<Message, 'conversationId'>>(
      `me/messages/${draftId}?$select=conversationId`,
    );
    const threadId = requireField(draftBeforeSend.conversationId, 'conversationId');
    await this.requestVoid(`me/messages/${draftId}/send`, { method: 'POST' });
    // Sent Items gets a new id on send; messageId here is the pre-send draft id, returned best-effort.
    return { messageId: draftId, threadId };
  }

  async deleteDraft(draftId: MailProviderId): Promise<void> {
    await this.requestVoid(`me/messages/${draftId}`, { method: 'DELETE' });
  }

  async setArchived(messageId: MailProviderId, archived: boolean): Promise<MailActionResult> {
    return this.moveMessage(messageId, archived ? 'archive' : 'inbox');
  }

  async setTrashed(messageId: MailProviderId, trashed: boolean): Promise<MailActionResult> {
    return this.moveMessage(messageId, trashed ? 'deleteditems' : 'inbox');
  }

  async setStarred(messageId: MailProviderId, starred: boolean): Promise<MailActionResult> {
    const raw = await this.patchMessage(messageId, {
      flag: { flagStatus: starred ? 'flagged' : 'notFlagged' },
    });
    return this.toMailActionResult(raw);
  }

  async setRead(messageId: MailProviderId, read: boolean): Promise<MailActionResult> {
    const raw = await this.patchMessage(messageId, { isRead: read });
    return this.toMailActionResult(raw);
  }

  async listLabels(): Promise<MailLabel[]> {
    const response = await this.request<GraphODataCollection<OutlookCategory>>(
      'me/outlook/masterCategories',
    );
    return response.value.map((category) => {
      const name = requireField(category.displayName, 'displayName');
      return { id: name, name, type: 'user' as const };
    });
  }

  async search(query: string, pageToken?: string | null): Promise<MailSearchResult> {
    const url = pageToken ?? this.searchUrl(query);
    const page =
      await this.request<GraphODataCollection<Pick<Message, 'id' | 'conversationId'>>>(url);

    const threadIds: MailProviderId[] = [];
    const seen = new Set<string>();
    for (const raw of page.value) {
      if (!raw.conversationId || seen.has(raw.conversationId)) continue;
      seen.add(raw.conversationId);
      threadIds.push(raw.conversationId);
    }

    return { threadIds, nextPageToken: page['@odata.nextLink'] ?? null };
  }

  async listRecentInboxThreadIds(limit: number): Promise<MailProviderId[]> {
    const wellKnownFolderIds = await this.getWellKnownFolderIds();
    const inboxId = this.requireFolderId(wellKnownFolderIds, 'inbox');
    const params = new URLSearchParams({
      $select: 'id,conversationId',
      $orderby: 'receivedDateTime desc',
      $top: RECENT_INBOX_PAGE_SIZE,
    });

    const seen = new Set<MailProviderId>();
    const threadIds: MailProviderId[] = [];
    let nextUrl: string | undefined = `me/mailFolders/${inboxId}/messages?${params.toString()}`;

    while (nextUrl && threadIds.length < limit) {
      const page: GraphODataCollection<Pick<Message, 'id' | 'conversationId'>> =
        await this.request(nextUrl);
      for (const raw of page.value) {
        if (!raw.conversationId || seen.has(raw.conversationId)) continue;
        seen.add(raw.conversationId);
        threadIds.push(raw.conversationId);
        if (threadIds.length >= limit) break;
      }
      nextUrl = page['@odata.nextLink'];
    }

    return threadIds;
  }

  async getAttachment(
    messageId: MailProviderId,
    attachmentId: string,
  ): Promise<MailAttachmentContent> {
    const raw = await this.request<FileAttachment>(
      `me/messages/${messageId}/attachments/${attachmentId}`,
    );
    const contentBytes = requireField(raw.contentBytes, 'contentBytes');
    return { size: raw.size ?? 0, data: Buffer.from(contentBytes, 'base64') };
  }

  // Graph drafts are ordinary messages, so `draftId` already addresses the same resource `getAttachment` does.
  async getDraftAttachment(
    draftId: MailProviderId,
    attachmentId: string,
  ): Promise<MailAttachmentContent> {
    return this.getAttachment(draftId, attachmentId);
  }

  // --- internals ---------------------------------------------------------

  private request<T>(path: string, options?: GraphRequestOptions): Promise<T> {
    return graphRequest<T>(this.getAccessToken, path, options);
  }

  private requestVoid(path: string, options?: GraphRequestOptions): Promise<void> {
    return graphRequestVoid(this.getAccessToken, path, options);
  }

  private patchMessage(messageId: MailProviderId, patch: Partial<Message>): Promise<Message> {
    return this.request<Message>(`me/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  private searchUrl(query: string): string {
    const params = new URLSearchParams({
      $search: buildGraphSearchQuery(query),
      $select: 'id,conversationId',
      $top: SEARCH_PAGE_SIZE,
    });
    return `me/messages?${params.toString()}`;
  }

  private async fetchAttachmentsMeta(
    messageId: MailProviderId,
  ): Promise<GraphAttachmentMetadata[]> {
    // contentId only exists on the derived fileAttachment type, so it needs the OData type-cast prefix.
    const params = new URLSearchParams({
      $select: 'id,name,contentType,size,isInline,microsoft.graph.fileAttachment/contentId',
    });
    const response = await this.request<GraphODataCollection<GraphAttachmentMetadata>>(
      `me/messages/${messageId}/attachments?${params.toString()}`,
    );
    return response.value;
  }

  private async reconcileAttachments(
    messageId: MailProviderId,
    attachments: MailAttachmentInput[],
    existingAttachmentIds: string[],
  ): Promise<void> {
    await Promise.all(
      existingAttachmentIds.map((id) =>
        this.requestVoid(`me/messages/${messageId}/attachments/${id}`, { method: 'DELETE' }),
      ),
    );
    for (const attachment of attachments) {
      await this.addAttachment(messageId, attachment);
    }
  }

  private async addAttachment(
    messageId: MailProviderId,
    attachment: MailAttachmentInput,
  ): Promise<void> {
    if (attachment.content.byteLength <= INLINE_ATTACHMENT_MAX_BYTES) {
      await this.addInlineAttachment(messageId, attachment);
      return;
    }
    await this.addAttachmentViaUploadSession(messageId, attachment);
  }

  private async addInlineAttachment(
    messageId: MailProviderId,
    attachment: MailAttachmentInput,
  ): Promise<void> {
    const body: GraphFileAttachmentCreate = {
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: attachment.filename,
      contentType: attachment.mimeType,
      contentBytes: attachment.content.toString('base64'),
      ...(attachment.contentId ? { contentId: attachment.contentId, isInline: true } : {}),
    };
    await this.request<FileAttachment>(`me/messages/${messageId}/attachments`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  private async addAttachmentViaUploadSession(
    messageId: MailProviderId,
    attachment: MailAttachmentInput,
  ): Promise<void> {
    const attachmentItem: AttachmentItem = {
      attachmentType: 'file',
      name: attachment.filename,
      contentType: attachment.mimeType,
      size: attachment.content.byteLength,
      ...(attachment.contentId ? { isInline: true, contentId: attachment.contentId } : {}),
    };
    const requestBody: GraphCreateUploadSessionRequest = { AttachmentItem: attachmentItem };

    const session = await this.request<UploadSession>(
      `me/messages/${messageId}/attachments/createUploadSession`,
      {
        method: 'POST',
        body: JSON.stringify(requestBody),
      },
    );

    const uploadUrl = requireField(session.uploadUrl, 'uploadUrl');
    const total = attachment.content.byteLength;

    for (let start = 0; start < total; start += UPLOAD_CHUNK_SIZE_BYTES) {
      const end = Math.min(start + UPLOAD_CHUNK_SIZE_BYTES, total) - 1;
      const chunk = attachment.content.subarray(start, end + 1);
      const outcome = await putUploadSessionChunk(uploadUrl, chunk, { start, end, total });
      if (outcome.status === 'completed') return;
    }

    throw new GraphApiError('Upload session finished without a completed chunk response', 502);
  }

  private requireFolderId(
    wellKnownFolderIds: GraphWellKnownFolderIds,
    name: GraphWellKnownFolderName,
  ): string {
    const id = wellKnownFolderIds[name];
    if (!id) {
      throw new GraphApiError(`Mailbox has no well-known folder "${name}"`, 404);
    }
    return id;
  }

  private async moveMessage(
    messageId: MailProviderId,
    destination: GraphWellKnownFolderName,
  ): Promise<MailActionResult> {
    const wellKnownFolderIds = await this.getWellKnownFolderIds();
    const raw = await this.request<Message>(`me/messages/${messageId}/move`, {
      method: 'POST',
      body: JSON.stringify({
        destinationId: this.requireFolderId(wellKnownFolderIds, destination),
      }),
    });
    return this.toMailActionResult(raw);
  }

  private async toMailActionResult(raw: Message): Promise<MailActionResult> {
    const metadata = toMailMessageMetadata(raw, await this.getWellKnownFolderIds());
    return {
      messageId: metadata.id,
      threadId: metadata.threadId,
      labelIds: metadata.labelIds,
      folder: metadata.folder,
      unread: metadata.unread,
      starred: metadata.starred,
    };
  }

  private async getWellKnownFolderIds(): Promise<GraphWellKnownFolderIds> {
    if (!this.wellKnownFolderIdsPromise) {
      this.wellKnownFolderIdsPromise = this.resolveWellKnownFolderIds();
    }
    return this.wellKnownFolderIdsPromise;
  }

  private async resolveWellKnownFolderIds(): Promise<GraphWellKnownFolderIds> {
    const entries = await Promise.all(
      WELL_KNOWN_FOLDER_NAMES.map(async (name) => {
        try {
          const folder = await this.request<GraphMailFolderResource>(
            `me/mailFolders/${name}?$select=id`,
          );
          return [name, requireField(folder.id, 'id')] as const;
        } catch (error) {
          if (error instanceof GraphApiError && error.status === 404) return null;
          throw error;
        }
      }),
    );

    return Object.fromEntries(
      entries.filter(
        (entry): entry is readonly [GraphWellKnownFolderName, string] => entry !== null,
      ),
    );
  }

  private initialDeltaLink(folderId: string): string {
    const params = new URLSearchParams({
      $deltatoken: 'latest',
      $select: METADATA_SELECT_FIELDS.join(','),
    });
    return `me/mailFolders/${folderId}/messages/delta?${params.toString()}`;
  }

  private async syncFolder(
    startLink: string,
    wellKnownFolderIds: GraphWellKnownFolderIds,
  ): Promise<{ changes: MailSyncChange[]; deltaLink: string } | 'expired'> {
    const aggregated = new Map<string, GraphAggregatedChange>();
    let nextUrl: string | undefined = startLink;
    let deltaLink: string | undefined;

    while (nextUrl) {
      let page: GraphDeltaPage<GraphDeltaMessage>;
      try {
        page = await this.request<GraphDeltaPage<GraphDeltaMessage>>(nextUrl);
      } catch (error) {
        if (isGraphDeltaExpired(error)) return 'expired';
        throw error;
      }

      aggregateDeltaPage(page.value, aggregated);
      deltaLink = page['@odata.deltaLink'];
      nextUrl = deltaLink ? undefined : page['@odata.nextLink'];

      if (!deltaLink && !nextUrl) {
        throw new GraphApiError('Graph delta response has neither nextLink nor deltaLink', 502);
      }
    }

    const changes = await this.resolveAggregatedChanges(aggregated, wellKnownFolderIds);
    return { changes, deltaLink: requireField(deltaLink, 'deltaLink') };
  }

  private async resolveAggregatedChanges(
    aggregated: Map<string, GraphAggregatedChange>,
    wellKnownFolderIds: GraphWellKnownFolderIds,
  ): Promise<MailSyncChange[]> {
    const changes: MailSyncChange[] = [];

    for (const change of aggregated.values()) {
      if (change.type === 'upserted') {
        changes.push({
          type: 'added',
          message: toMailMessageMetadata(change.message, wellKnownFolderIds),
        });
        continue;
      }

      try {
        const raw = await this.request<Message>(
          `me/messages/${change.messageId}?$select=${METADATA_SELECT_FIELDS.join(',')}`,
        );
        const metadata = toMailMessageMetadata(raw, wellKnownFolderIds);
        changes.push({
          type: 'flagsChanged',
          messageId: metadata.id,
          threadId: metadata.threadId,
          labelIds: metadata.labelIds,
          folder: metadata.folder,
          unread: metadata.unread,
          starred: metadata.starred,
        });
      } catch (error) {
        if (error instanceof GraphApiError && error.status === 404) {
          // @removed only carries an id; conversationId is unrecoverable once the message is gone.
          changes.push({ type: 'deleted', messageId: change.messageId, threadId: '' });
          continue;
        }
        throw error;
      }
    }

    return changes;
  }
}

function changeMessageId(change: MailSyncChange): string {
  return change.type === 'added' ? change.message.id : change.messageId;
}

function parseGraphSyncCursor(cursor: string): GraphSyncCursor {
  try {
    const parsed = JSON.parse(cursor) as GraphSyncCursor;
    if (parsed.v === 1 && parsed.folders && typeof parsed.folders === 'object') {
      return parsed;
    }
  } catch {
    // Malformed or foreign cursor: fall through to a fresh one below.
  }
  return { v: 1, folders: {} };
}

export function createGraphProvider(options: GraphProviderOptions): GraphProvider {
  return new GraphProvider(options);
}
