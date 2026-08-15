// apps/api/test/email/support/mail-provider.mock.ts
//
// Fakes `@repo/mail/provider`'s `createGmailProvider` (docs/testing/
// strategy.md's "External boundaries": apps/api never talks to Gmail
// directly, only through the `MailProvider` interface built by
// email-provider.service.ts). Mirrors packages/testing/src/mocks/
// linkedin-provider.mock.ts's mechanism (fake the factory function, spread
// the real module for everything else) but lives inside apps/api/test
// instead of packages/testing, per this suite's file ownership (apps/api/
// test/** only, no packages/* edits).
//
// That placement also sidesteps the injected-workspace-packages resolution
// hazard the linkedin/queue mocks need apps/api/test/preload.ts to work
// around (README, "External-provider mocks"): this file's own
// `mock.module('@repo/mail/provider', ...)` call already runs from within
// apps/api's own module-resolution context (it's a file inside apps/api),
// so there is no second "frozen .pnpm copy" context to reconcile - one
// registration, right here, is enough.
//
// email-provider.service.ts's `getGmailProviderForUser` still calls the
// real `getGoogleGmailScopeStatus` (a plain DB read of better-auth's
// `account` table) before ever reaching `createGmailProvider`, so a test
// still needs a linked Google account with the `gmail.modify` scope seeded
// first - see gmail-account-fixtures.ts, mirroring how the LinkedIn tests
// seed a linked account via seedLinkedinAccount. Once that check passes,
// `createGmailProvider` here returns `fakeMailProvider` directly, without
// ever invoking the real `getAccessToken` callback the service wires up -
// no real Google token exchange happens on this path at all.
import { mock } from 'bun:test';
import * as mailProviderPackage from '@repo/mail/provider';
import type {
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
    unread: overrides.unread ?? false,
    starred: overrides.starred ?? false,
    body: overrides.body ?? { text: 'Hello from a fake message.', html: '<p>Hello from a fake message.</p>', attachments: [] },
    messageIdHeader: overrides.messageIdHeader ?? `<${id}@mail.test>`,
    inReplyTo: overrides.inReplyTo ?? null,
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
  return Promise.resolve({ emailAddress: 'mocked-gmail-user@example.test', cursor: 'history-cursor-0' });
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
function defaultFetchMessageImpl(messageId: MailProviderId, _format: 'metadata' | 'full'): Promise<MailMessage> {
  return Promise.resolve(buildFakeMailMessage({ id: messageId }));
}

function defaultSendImpl(_input: SendMailInput): Promise<SendMailResult> {
  return Promise.resolve({ messageId: nextFixtureId('sent-message'), threadId: nextFixtureId('sent-thread') });
}

function defaultSetArchivedImpl(messageId: MailProviderId, archived: boolean): Promise<MailActionResult> {
  return Promise.resolve({
    messageId,
    threadId: 'thread-default',
    labelIds: archived ? [] : ['INBOX'],
    unread: false,
    starred: false,
  });
}

function defaultTrashMessageImpl(messageId: MailProviderId): Promise<MailActionResult> {
  return Promise.resolve({
    messageId,
    threadId: 'thread-default',
    labelIds: ['TRASH'],
    unread: false,
    starred: false,
  });
}

function defaultSetStarredImpl(messageId: MailProviderId, starred: boolean): Promise<MailActionResult> {
  return Promise.resolve({
    messageId,
    threadId: 'thread-default',
    labelIds: starred ? ['STARRED'] : [],
    unread: false,
    starred,
  });
}

function defaultSetReadImpl(messageId: MailProviderId, read: boolean): Promise<MailActionResult> {
  return Promise.resolve({
    messageId,
    threadId: 'thread-default',
    labelIds: [],
    unread: !read,
    starred: false,
  });
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

function defaultUpdateDraftImpl(draftId: MailProviderId, _input: SendMailInput): Promise<MailDraft> {
  return Promise.resolve(buildFakeMailDraft({ id: draftId }));
}

function defaultGetDraftImpl(draftId: MailProviderId): Promise<MailDraft> {
  return Promise.resolve(buildFakeMailDraft({ id: draftId }));
}

function defaultListDraftsImpl(): Promise<MailDraftSummary[]> {
  return Promise.resolve([]);
}

function defaultSendDraftImpl(_draftId: MailProviderId): Promise<SendMailResult> {
  return Promise.resolve({ messageId: nextFixtureId('sent-message'), threadId: nextFixtureId('sent-thread') });
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
export const trashMessageMock = mock(defaultTrashMessageImpl);
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
  trashMessage: trashMessageMock,
  setStarred: setStarredMock,
  setRead: setReadMock,
  listLabels: listLabelsMock,
  search: searchMock,
  getAttachment: getAttachmentMock,
  getDraftAttachment: getDraftAttachmentMock,
};

export const createGmailProviderMock = mock(() => fakeMailProvider);

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
  trashMessageMock.mockClear();
  trashMessageMock.mockImplementation(defaultTrashMessageImpl);
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
  createGmailProviderMock.mockClear();
}

export const mailProviderModuleMock = {
  ...mailProviderPackage,
  createGmailProvider: createGmailProviderMock,
};

mock.module('@repo/mail/provider', () => mailProviderModuleMock);
