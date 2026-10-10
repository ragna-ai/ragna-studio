// packages/testing/src/mail/mail-provider.mock.ts
import { mock } from 'bun:test';
import * as mailProviderPackage from '@repo/mail/provider';
import type {
  CreateMailProviderOptions,
  MailAccountProfile,
  MailActionResult,
  MailAttachmentContent,
  MailDraft,
  MailDraftSummary,
  MailLabel,
  MailMessage,
  MailProvider,
  MailProviderId,
  MailSearchResult,
  MailSyncOutcome,
  MailThread,
  SendMailInput,
  SendMailResult,
} from '@repo/mail/provider';

// --- Fixture builders ---------------------------------------------------
// Exported so individual test files can script realistic responses
// (mockImplementationOnce / mockResolvedValueOnce) without hand-rolling the
// full MailMessage/MailThread shape every time.

let fixtureCounter = 0;
function nextFixtureId(prefix: string): string {
  fixtureCounter += 1;
  return `${prefix}-${fixtureCounter}`;
}

export function buildFakeMailMessage(overrides: Partial<MailMessage> = {}): MailMessage {
  const id = overrides.id ?? nextFixtureId('provider-message');

  return {
    id,
    threadId: overrides.threadId ?? nextFixtureId('provider-thread'),
    from: overrides.from ?? { name: 'Sender', address: 'sender@example.test' },
    to: overrides.to ?? [{ name: 'Recipient', address: 'recipient@example.test' }],
    cc: overrides.cc ?? [],
    bcc: overrides.bcc ?? [],
    subject: overrides.subject ?? 'Test subject',
    snippet: overrides.snippet ?? 'Test snippet',
    date: overrides.date ?? new Date(),
    labelIds: overrides.labelIds ?? ['INBOX'],
    folder: overrides.folder ?? 'inbox',
    unread: overrides.unread ?? false,
    starred: overrides.starred ?? false,
    body: overrides.body ?? {
      text: 'Hello from a fake message.',
      html: '<p>Hello from a fake message.</p>',
      attachments: [],
    },
    messageIdHeader:
      'messageIdHeader' in overrides ? (overrides.messageIdHeader ?? null) : `<${id}@mail.test>`,
    inReplyTo: 'inReplyTo' in overrides ? (overrides.inReplyTo ?? null) : null,
    references: overrides.references ?? [],
  };
}

export function buildFakeMailThread(overrides: Partial<MailThread> = {}): MailThread {
  const id = overrides.id ?? nextFixtureId('provider-thread');
  const messages = overrides.messages ?? [buildFakeMailMessage({ threadId: id })];

  return { id, messages };
}

export function buildFakeMailDraft(overrides: Partial<MailDraft> = {}): MailDraft {
  const id = overrides.id ?? nextFixtureId('provider-draft');

  return {
    id,
    threadId: overrides.threadId ?? nextFixtureId('provider-thread'),
    to: overrides.to ?? [{ name: 'Recipient', address: 'recipient@example.test' }],
    cc: overrides.cc ?? [],
    bcc: overrides.bcc ?? [],
    subject: overrides.subject ?? 'Test subject',
    snippet: overrides.snippet ?? 'Test snippet',
    date: overrides.date ?? new Date(),
    body: overrides.body ?? { text: 'Draft body.', html: null, attachments: [] },
  };
}

// --- Per-method mocks -----------------------------------------------------

function defaultGetProfileImpl(): Promise<MailAccountProfile> {
  return Promise.resolve({
    emailAddress: 'mocked-gmail-user@example.test',
    cursor: 'history-cursor-0',
  });
}

function defaultSyncFromCursorImpl(cursor: string): Promise<MailSyncOutcome> {
  return Promise.resolve({ status: 'ok', changes: [], nextCursor: cursor });
}

function defaultFetchThreadImpl(threadId: MailProviderId): Promise<MailThread> {
  return Promise.resolve(buildFakeMailThread({ id: threadId }));
}

// The interface overloads fetchMessage by `format`; a plain function
// returning the ('full') superset shape satisfies both call sites (a
// 'metadata' caller only reads the metadata fields). TypeScript checks
// assignability against an overloaded property using only the last
// overload signature, which here is the 'full' one.
function defaultFetchMessageImpl(
  messageId: MailProviderId,
  _format: 'metadata' | 'full',
): Promise<MailMessage> {
  return Promise.resolve(buildFakeMailMessage({ id: messageId }));
}

function defaultSendImpl(_input: SendMailInput): Promise<SendMailResult> {
  return Promise.resolve({
    messageId: nextFixtureId('sent-message'),
    threadId: nextFixtureId('sent-thread'),
  });
}

function defaultSetArchivedImpl(
  messageId: MailProviderId,
  archived: boolean,
): Promise<MailActionResult> {
  return Promise.resolve({
    messageId,
    threadId: 'thread-default',
    labelIds: archived ? [] : ['INBOX'],
    folder: archived ? 'archive' : 'inbox',
    unread: false,
    starred: false,
  });
}

function defaultSetTrashedImpl(
  messageId: MailProviderId,
  trashed: boolean,
): Promise<MailActionResult> {
  return Promise.resolve({
    messageId,
    threadId: 'thread-default',
    labelIds: trashed ? ['TRASH'] : ['INBOX'],
    folder: trashed ? 'trash' : 'inbox',
    unread: false,
    starred: false,
  });
}

function defaultSetStarredImpl(
  messageId: MailProviderId,
  starred: boolean,
): Promise<MailActionResult> {
  return Promise.resolve({
    messageId,
    threadId: 'thread-default',
    labelIds: starred ? ['STARRED'] : [],
    folder: 'inbox',
    unread: false,
    starred,
  });
}

function defaultSetReadImpl(messageId: MailProviderId, read: boolean): Promise<MailActionResult> {
  return Promise.resolve({
    messageId,
    threadId: 'thread-default',
    labelIds: [],
    folder: 'inbox',
    unread: !read,
    starred: false,
  });
}

function defaultListRecentInboxThreadIdsImpl(): Promise<MailProviderId[]> {
  return Promise.resolve([]);
}

function defaultListLabelsImpl(): Promise<MailLabel[]> {
  return Promise.resolve([]);
}

function defaultSearchImpl(_query: string, _pageToken?: string | null): Promise<MailSearchResult> {
  return Promise.resolve({ threadIds: [], nextPageToken: null });
}

function defaultGetAttachmentImpl(
  _messageId: MailProviderId,
  _attachmentId: string,
): Promise<MailAttachmentContent> {
  return Promise.resolve({ size: 3, data: Buffer.from('abc') });
}

function defaultGetDraftAttachmentImpl(
  _draftId: MailProviderId,
  _attachmentId: string,
): Promise<MailAttachmentContent> {
  return Promise.resolve({ size: 3, data: Buffer.from('abc') });
}

function defaultCreateDraftImpl(_input: SendMailInput): Promise<MailDraft> {
  return Promise.resolve(buildFakeMailDraft());
}

function defaultUpdateDraftImpl(
  draftId: MailProviderId,
  _input: SendMailInput,
): Promise<MailDraft> {
  return Promise.resolve(buildFakeMailDraft({ id: draftId }));
}

function defaultGetDraftImpl(draftId: MailProviderId): Promise<MailDraft> {
  return Promise.resolve(buildFakeMailDraft({ id: draftId }));
}

function defaultListDraftsImpl(): Promise<MailDraftSummary[]> {
  return Promise.resolve([]);
}

function defaultSendDraftImpl(_draftId: MailProviderId): Promise<SendMailResult> {
  return Promise.resolve({
    messageId: nextFixtureId('sent-message'),
    threadId: nextFixtureId('sent-thread'),
  });
}

function defaultDeleteDraftImpl(_draftId: MailProviderId): Promise<void> {
  return Promise.resolve();
}

export const getProfileMock = mock(defaultGetProfileImpl);
export const syncFromCursorMock = mock(defaultSyncFromCursorImpl);
export const fetchThreadMock = mock(defaultFetchThreadImpl);
export const fetchMessageMock = mock(defaultFetchMessageImpl);
export const sendMock = mock(defaultSendImpl);
export const setArchivedMock = mock(defaultSetArchivedImpl);
export const setTrashedMock = mock(defaultSetTrashedImpl);
export const setStarredMock = mock(defaultSetStarredImpl);
export const setReadMock = mock(defaultSetReadImpl);
export const listLabelsMock = mock(defaultListLabelsImpl);
export const searchMock = mock(defaultSearchImpl);
export const getAttachmentMock = mock(defaultGetAttachmentImpl);
export const getDraftAttachmentMock = mock(defaultGetDraftAttachmentImpl);
export const createDraftMock = mock(defaultCreateDraftImpl);
export const updateDraftMock = mock(defaultUpdateDraftImpl);
export const getDraftMock = mock(defaultGetDraftImpl);
export const listDraftsMock = mock(defaultListDraftsImpl);
export const sendDraftMock = mock(defaultSendDraftImpl);
export const deleteDraftMock = mock(defaultDeleteDraftImpl);
export const listRecentInboxThreadIdsMock = mock(defaultListRecentInboxThreadIdsImpl);

const fakeMailProvider: MailProvider = {
  getProfile: getProfileMock,
  syncFromCursor: syncFromCursorMock,
  fetchThread: fetchThreadMock,
  fetchMessage: fetchMessageMock,
  send: sendMock,
  createDraft: createDraftMock,
  updateDraft: updateDraftMock,
  getDraft: getDraftMock,
  listDrafts: listDraftsMock,
  sendDraft: sendDraftMock,
  deleteDraft: deleteDraftMock,
  setArchived: setArchivedMock,
  setTrashed: setTrashedMock,
  setStarred: setStarredMock,
  setRead: setReadMock,
  listLabels: listLabelsMock,
  search: searchMock,
  listRecentInboxThreadIds: listRecentInboxThreadIdsMock,
  getAttachment: getAttachmentMock,
  getDraftAttachment: getDraftAttachmentMock,
};

// Ignores which provider was requested - one fake MailProvider serves both.
export const createMailProviderMock = mock(
  (_options: CreateMailProviderOptions) => fakeMailProvider,
);

export function resetMailProviderMock(): void {
  getProfileMock.mockClear();
  getProfileMock.mockImplementation(defaultGetProfileImpl);
  syncFromCursorMock.mockClear();
  syncFromCursorMock.mockImplementation(defaultSyncFromCursorImpl);
  fetchThreadMock.mockClear();
  fetchThreadMock.mockImplementation(defaultFetchThreadImpl);
  fetchMessageMock.mockClear();
  fetchMessageMock.mockImplementation(defaultFetchMessageImpl);
  sendMock.mockClear();
  sendMock.mockImplementation(defaultSendImpl);
  setArchivedMock.mockClear();
  setArchivedMock.mockImplementation(defaultSetArchivedImpl);
  setTrashedMock.mockClear();
  setTrashedMock.mockImplementation(defaultSetTrashedImpl);
  setStarredMock.mockClear();
  setStarredMock.mockImplementation(defaultSetStarredImpl);
  setReadMock.mockClear();
  setReadMock.mockImplementation(defaultSetReadImpl);
  listLabelsMock.mockClear();
  listLabelsMock.mockImplementation(defaultListLabelsImpl);
  searchMock.mockClear();
  searchMock.mockImplementation(defaultSearchImpl);
  getAttachmentMock.mockClear();
  getAttachmentMock.mockImplementation(defaultGetAttachmentImpl);
  getDraftAttachmentMock.mockClear();
  getDraftAttachmentMock.mockImplementation(defaultGetDraftAttachmentImpl);
  createDraftMock.mockClear();
  createDraftMock.mockImplementation(defaultCreateDraftImpl);
  updateDraftMock.mockClear();
  updateDraftMock.mockImplementation(defaultUpdateDraftImpl);
  getDraftMock.mockClear();
  getDraftMock.mockImplementation(defaultGetDraftImpl);
  listDraftsMock.mockClear();
  listDraftsMock.mockImplementation(defaultListDraftsImpl);
  sendDraftMock.mockClear();
  sendDraftMock.mockImplementation(defaultSendDraftImpl);
  deleteDraftMock.mockClear();
  deleteDraftMock.mockImplementation(defaultDeleteDraftImpl);
  listRecentInboxThreadIdsMock.mockClear();
  listRecentInboxThreadIdsMock.mockImplementation(defaultListRecentInboxThreadIdsImpl);
  createMailProviderMock.mockClear();
}

export const mailProviderModuleMock = {
  ...mailProviderPackage,
  createMailProvider: createMailProviderMock,
};

mock.module('@repo/mail/provider', () => mailProviderModuleMock);
