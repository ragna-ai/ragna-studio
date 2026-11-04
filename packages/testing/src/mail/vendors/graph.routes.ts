// packages/testing/src/mail/vendors/graph.routes.ts
//
// Microsoft Graph v1.0 answers for the shared test mailbox. Payload shapes are trimmed copies
// of real /me/messages, /me/mailFolders and delta responses, ids and people replaced.
// GET /v1.0/me is answered by the OAuth profile fake in provider-http.mock.ts.
import {
  vendorEmpty,
  vendorJson,
  vendorRoute,
  type VendorEndpoint,
  type VendorRequest,
  type VendorRoute,
} from '../../vendor-http/vendor-route';
import {
  MAILBOX_ATTACHMENT,
  MAILBOX_BOB,
  MAILBOX_FIRST_MESSAGE,
  MAILBOX_NEW_MESSAGE,
  MAILBOX_REPLY,
  type MailboxMessage,
  type MailboxPerson,
} from './mailbox.fixture';

const HOST = 'graph.microsoft.com';
const BASE = '/v1.0/me';
const GRAPH_URL = `https://${HOST}${BASE}`;

type GraphFolderName = 'inbox' | 'sentitems' | 'deleteditems' | 'junkemail' | 'drafts' | 'archive';

const FOLDER_IDS: Record<GraphFolderName, string> = {
  inbox: 'AAMkAGI2THVSAAA-inbox-AAAAAAEMAAA=',
  sentitems: 'AAMkAGI2THVSAAA-sentitems-AAAAAAEJAAA=',
  deleteditems: 'AAMkAGI2THVSAAA-deleteditems-AAAAAAEKAAA=',
  junkemail: 'AAMkAGI2THVSAAA-junkemail-AAAAAAEiAAA=',
  drafts: 'AAMkAGI2THVSAAA-drafts-AAAAAAEPAAA=',
  archive: 'AAMkAGI2THVSAAA-archive-AAAAAAFdAAA=',
};

export const GRAPH_MAILBOX = {
  /** The address the OAuth profile fake reports for a Microsoft account. */
  emailAddress: 'user@microsoft.test',
  conversationId: 'AAQkAGI2THVSAAAQAKfakeConversationQ3report=',
  firstMessageId: 'AAMkAGI2THVSAAABGAAAAAAfakeFirstMessage001AAA=',
  replyMessageId: 'AAMkAGI2THVSAAABGAAAAAAfakeReplyMessage002AAA=',
  newMessageId: 'AAMkAGI2THVSAAABGAAAAAAfakeNewMessage003AAA=',
  draftId: 'AAMkAGI2THVSAAABGAAAAAAfakeDraftMessage004AAA=',
  attachmentId: 'AAMkAGI2THVSAAABEgAQAfakeAttachmentQ3report=',
  uploadedAttachmentId: 'AAMkAGI2THVSAAABEgAQAfakeUploadedAttachment=',
  folderIds: FOLDER_IDS,
  initialDeltaToken: 'fakeDeltaTokenInitial',
  nextDeltaToken: 'fakeDeltaTokenNext',
} as const;

export const GRAPH_ENDPOINTS = {
  folder: { method: 'GET', host: HOST, path: new RegExp(`^${BASE}/mailFolders/([^/]+)$`) },
  folderMessages: {
    method: 'GET',
    host: HOST,
    path: new RegExp(`^${BASE}/mailFolders/([^/]+)/messages$`),
  },
  folderDelta: {
    method: 'GET',
    host: HOST,
    path: new RegExp(`^${BASE}/mailFolders/([^/]+)/messages/delta$`),
  },
  messages: { method: 'GET', host: HOST, path: new RegExp(`^${BASE}/messages$`) },
  message: { method: 'GET', host: HOST, path: new RegExp(`^${BASE}/messages/([^/]+)$`) },
  attachments: {
    method: 'GET',
    host: HOST,
    path: new RegExp(`^${BASE}/messages/([^/]+)/attachments$`),
  },
  attachment: {
    method: 'GET',
    host: HOST,
    path: new RegExp(`^${BASE}/messages/([^/]+)/attachments/([^/]+)$`),
  },
  patchMessage: { method: 'PATCH', host: HOST, path: new RegExp(`^${BASE}/messages/([^/]+)$`) },
  createMessage: { method: 'POST', host: HOST, path: new RegExp(`^${BASE}/messages$`) },
  createReply: {
    method: 'POST',
    host: HOST,
    path: new RegExp(`^${BASE}/messages/([^/]+)/createReply$`),
  },
  send: { method: 'POST', host: HOST, path: new RegExp(`^${BASE}/messages/([^/]+)/send$`) },
  move: { method: 'POST', host: HOST, path: new RegExp(`^${BASE}/messages/([^/]+)/move$`) },
  deleteMessage: { method: 'DELETE', host: HOST, path: new RegExp(`^${BASE}/messages/([^/]+)$`) },
  deleteAttachment: {
    method: 'DELETE',
    host: HOST,
    path: new RegExp(`^${BASE}/messages/([^/]+)/attachments/([^/]+)$`),
  },
  categories: { method: 'GET', host: HOST, path: new RegExp(`^${BASE}/outlook/masterCategories$`) },
  createUploadSession: {
    method: 'POST',
    host: HOST,
    path: new RegExp(`^${BASE}/messages/([^/]+)/attachments/createUploadSession$`),
  },
  uploadChunk: { method: 'PUT', host: HOST, path: /^\/fake-upload-session\/([^/]+)$/ },
} satisfies Record<string, VendorEndpoint>;

export const GRAPH_NOT_FOUND_BODY = {
  error: {
    code: 'ErrorItemNotFound',
    message: 'The specified object was not found in the store.',
    innerError: {
      date: '2026-10-02T10:00:00',
      'request-id': '7f3c0e2a-0000-4000-8000-000000000001',
      'client-request-id': '7f3c0e2a-0000-4000-8000-000000000002',
    },
  },
};

export const GRAPH_SYNC_STATE_NOT_FOUND_BODY = {
  error: {
    code: 'SyncStateNotFound',
    message: 'The sync state generation is not found.',
  },
};

interface GraphMessageFixture {
  id: string;
  folder: GraphFolderName;
  isRead: boolean;
  message: MailboxMessage;
  internetMessageId: string;
  inReplyTo: string | null;
  withAttachment: boolean;
}

const FIRST_INTERNET_MESSAGE_ID =
  '<AM9PR07MB1234fake-first@AM9PR07MB1234.eurprd07.prod.outlook.com>';

const GRAPH_MESSAGES: readonly GraphMessageFixture[] = [
  {
    id: GRAPH_MAILBOX.firstMessageId,
    folder: 'inbox',
    isRead: true,
    message: MAILBOX_FIRST_MESSAGE,
    internetMessageId: FIRST_INTERNET_MESSAGE_ID,
    inReplyTo: null,
    withAttachment: true,
  },
  {
    id: GRAPH_MAILBOX.replyMessageId,
    folder: 'sentitems',
    isRead: true,
    message: MAILBOX_REPLY,
    internetMessageId: '<AM9PR07MB1234fake-reply@AM9PR07MB1234.eurprd07.prod.outlook.com>',
    inReplyTo: FIRST_INTERNET_MESSAGE_ID,
    withAttachment: false,
  },
  {
    id: GRAPH_MAILBOX.newMessageId,
    folder: 'inbox',
    isRead: false,
    message: MAILBOX_NEW_MESSAGE,
    internetMessageId: '<AM9PR07MB1234fake-new@AM9PR07MB1234.eurprd07.prod.outlook.com>',
    inReplyTo: FIRST_INTERNET_MESSAGE_ID,
    withAttachment: false,
  },
];

/** Messages in the conversation before the next sync brings the new one. */
const CONVERSATION_MESSAGE_IDS: readonly string[] = [
  GRAPH_MAILBOX.firstMessageId,
  GRAPH_MAILBOX.replyMessageId,
];

interface GraphMessageOverrides {
  isRead?: boolean;
  flagStatus?: string;
  parentFolderId?: string;
}

function recipient(person: MailboxPerson) {
  return { emailAddress: { name: person.name, address: person.address } };
}

function messageResource(fixture: GraphMessageFixture, overrides: GraphMessageOverrides = {}) {
  const { message } = fixture;
  const sentAt = message.sentAt.toISOString().replace('.000Z', 'Z');
  const headers = [
    { name: 'Message-ID', value: fixture.internetMessageId },
    { name: 'Subject', value: message.subject },
  ];
  if (fixture.inReplyTo) {
    headers.push({ name: 'In-Reply-To', value: fixture.inReplyTo });
    headers.push({ name: 'References', value: fixture.inReplyTo });
  }

  return {
    '@odata.etag': 'W/"CQAAABYAAAAfakeEtag"',
    id: fixture.id,
    createdDateTime: sentAt,
    lastModifiedDateTime: sentAt,
    receivedDateTime: sentAt,
    sentDateTime: sentAt,
    hasAttachments: fixture.withAttachment,
    internetMessageId: fixture.internetMessageId,
    internetMessageHeaders: headers,
    subject: message.subject,
    bodyPreview: message.text,
    importance: 'normal',
    parentFolderId: overrides.parentFolderId ?? FOLDER_IDS[fixture.folder],
    conversationId: GRAPH_MAILBOX.conversationId,
    isRead: overrides.isRead ?? fixture.isRead,
    isDraft: false,
    body: {
      contentType: 'html',
      content: `<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body><div>${message.text}</div></body></html>`,
    },
    from: recipient(message.from),
    sender: recipient(message.from),
    toRecipients: message.to.map(recipient),
    ccRecipients: [],
    bccRecipients: [],
    categories: [],
    flag: { flagStatus: overrides.flagStatus ?? 'notFlagged' },
  };
}

function draftResource() {
  return {
    id: GRAPH_MAILBOX.draftId,
    createdDateTime: '2026-10-02T10:00:00Z',
    lastModifiedDateTime: '2026-10-02T10:00:05Z',
    hasAttachments: false,
    subject: 'Draft subject',
    bodyPreview: 'Draft body',
    conversationId: 'AAQkAGI2THVSAAAQAKfakeNewConversation=',
    isDraft: true,
    body: { contentType: 'html', content: '<html><body><p>Draft body</p></body></html>' },
    toRecipients: [recipient(MAILBOX_BOB)],
    ccRecipients: [],
    bccRecipients: [],
  };
}

function findMessage(id: string | undefined): GraphMessageFixture | undefined {
  return GRAPH_MESSAGES.find((fixture) => fixture.id === id);
}

const FOLDER_NAMES: readonly GraphFolderName[] = [
  'inbox',
  'sentitems',
  'deleteditems',
  'junkemail',
  'drafts',
  'archive',
];

function findFolderName(idOrName: string | undefined): GraphFolderName | undefined {
  return FOLDER_NAMES.find((name) => name === idOrName || FOLDER_IDS[name] === idOrName);
}

function notFound(): Response {
  return vendorJson(GRAPH_NOT_FOUND_BODY, { status: 404 });
}

/** An absolute delta link the way Graph returns it in `@odata.deltaLink`. */
export function graphDeltaLink(folderId: string, token: string): string {
  return `${GRAPH_URL}/mailFolders/${folderId}/messages/delta?$deltatoken=${token}`;
}

function answerDelta(request: VendorRequest, match: RegExpMatchArray): Response {
  const folderId = match[1] ?? '';
  const token = request.url.searchParams.get('$deltatoken');
  const bringsNewMessage =
    token === GRAPH_MAILBOX.initialDeltaToken && folderId === FOLDER_IDS.inbox;

  if (token === 'latest' || token === null) {
    return vendorJson({
      value: [],
      '@odata.deltaLink': graphDeltaLink(folderId, GRAPH_MAILBOX.initialDeltaToken),
    });
  }

  const added = findMessage(GRAPH_MAILBOX.newMessageId);
  return vendorJson({
    value: bringsNewMessage && added ? [messageResource(added)] : [],
    '@odata.deltaLink': graphDeltaLink(
      folderId,
      bringsNewMessage ? GRAPH_MAILBOX.nextDeltaToken : (token ?? ''),
    ),
  });
}

function readConversationFilter(request: VendorRequest): string | null {
  const filter = request.url.searchParams.get('$filter');
  const match = filter?.match(/^conversationId eq '(.*)'$/);
  return match?.[1]?.replace(/''/g, "'") ?? null;
}

function answerMessages(request: VendorRequest): Response {
  if (request.url.searchParams.has('$search')) {
    return vendorJson({
      value: CONVERSATION_MESSAGE_IDS.map((id) => ({
        id,
        conversationId: GRAPH_MAILBOX.conversationId,
      })),
    });
  }

  if (readConversationFilter(request) !== GRAPH_MAILBOX.conversationId) {
    return vendorJson({ value: [] });
  }
  return vendorJson({
    value: GRAPH_MESSAGES.filter((fixture) => CONVERSATION_MESSAGE_IDS.includes(fixture.id)).map(
      (fixture) => messageResource(fixture),
    ),
  });
}

function answerFolderMessages(_request: VendorRequest, match: RegExpMatchArray): Response {
  if (findFolderName(match[1]) !== 'inbox') return vendorJson({ value: [] });
  return vendorJson({
    value: [{ id: GRAPH_MAILBOX.firstMessageId, conversationId: GRAPH_MAILBOX.conversationId }],
  });
}

function answerMessage(_request: VendorRequest, match: RegExpMatchArray): Response {
  if (match[1] === GRAPH_MAILBOX.draftId) return vendorJson(draftResource());
  const fixture = findMessage(match[1]);
  return fixture ? vendorJson(messageResource(fixture)) : notFound();
}

interface GraphMessagePatch {
  isRead?: boolean;
  flag?: { flagStatus?: string };
}

function answerPatch(request: VendorRequest, match: RegExpMatchArray): Response {
  if (match[1] === GRAPH_MAILBOX.draftId) return vendorJson(draftResource());
  const fixture = findMessage(match[1]);
  if (!fixture) return notFound();

  const patch: GraphMessagePatch = JSON.parse(request.body ?? '{}');
  return vendorJson(
    messageResource(fixture, { isRead: patch.isRead, flagStatus: patch.flag?.flagStatus }),
  );
}

function answerMove(request: VendorRequest, match: RegExpMatchArray): Response {
  const fixture = findMessage(match[1]);
  if (!fixture) return notFound();

  const body: { destinationId?: string } = JSON.parse(request.body ?? '{}');
  return vendorJson(messageResource(fixture, { parentFolderId: body.destinationId }));
}

function attachmentMetadata() {
  return {
    '@odata.type': '#microsoft.graph.fileAttachment',
    id: GRAPH_MAILBOX.attachmentId,
    name: MAILBOX_ATTACHMENT.filename,
    contentType: MAILBOX_ATTACHMENT.mimeType,
    size: MAILBOX_ATTACHMENT.bytes.byteLength,
    isInline: false,
    contentId: null,
  };
}

function answerCreateUploadSession(_request: VendorRequest, match: RegExpMatchArray): Response {
  return vendorJson({
    uploadUrl: `https://${HOST}/fake-upload-session/${encodeURIComponent(match[1] ?? '')}`,
    expirationDateTime: '2026-10-02T16:00:00Z',
    nextExpectedRanges: ['0-'],
  });
}

/** Answers each chunk with the next expected range; the last one completes with a Location. */
function answerUploadChunk(request: VendorRequest, match: RegExpMatchArray): Response {
  const range = request.headers.get('Content-Range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  const end = Number(range?.[2]);
  const total = Number(range?.[3]);
  if (end + 1 < total) {
    return vendorJson({
      expirationDateTime: '2026-10-02T16:00:00Z',
      nextExpectedRanges: [`${end + 1}-`],
    });
  }

  const messageId = decodeURIComponent(match[1] ?? '');
  return vendorEmpty(201, {
    Location: `https://outlook.office.com/api/v2.0/Users('fake-user')/Messages('${messageId}')/Attachments('${GRAPH_MAILBOX.uploadedAttachmentId}')`,
  });
}

export const GRAPH_MAILBOX_ROUTES: readonly VendorRoute[] = [
  vendorRoute(GRAPH_ENDPOINTS.folder, (_request, match) => {
    const name = findFolderName(match[1]);
    return name ? vendorJson({ id: FOLDER_IDS[name] }) : notFound();
  }),
  vendorRoute(GRAPH_ENDPOINTS.folderDelta, answerDelta),
  vendorRoute(GRAPH_ENDPOINTS.folderMessages, answerFolderMessages),
  vendorRoute(GRAPH_ENDPOINTS.messages, answerMessages),
  vendorRoute(GRAPH_ENDPOINTS.message, answerMessage),
  vendorRoute(GRAPH_ENDPOINTS.attachments, (_request, match) =>
    vendorJson({
      value: match[1] === GRAPH_MAILBOX.firstMessageId ? [attachmentMetadata()] : [],
    }),
  ),
  vendorRoute(GRAPH_ENDPOINTS.attachment, (_request, match) => {
    if (match[1] !== GRAPH_MAILBOX.firstMessageId || match[2] !== GRAPH_MAILBOX.attachmentId) {
      return notFound();
    }
    const metadata = attachmentMetadata();
    return vendorJson({
      '@odata.type': metadata['@odata.type'],
      id: metadata.id,
      name: metadata.name,
      contentType: metadata.contentType,
      size: metadata.size,
      isInline: metadata.isInline,
      contentId: metadata.contentId,
      contentBytes: MAILBOX_ATTACHMENT.bytes.toString('base64'),
    });
  }),
  vendorRoute(GRAPH_ENDPOINTS.patchMessage, answerPatch),
  vendorRoute(GRAPH_ENDPOINTS.createMessage, () => vendorJson(draftResource(), { status: 201 })),
  vendorRoute(GRAPH_ENDPOINTS.createReply, () => vendorJson(draftResource(), { status: 201 })),
  vendorRoute(GRAPH_ENDPOINTS.send, () => vendorEmpty(202)),
  vendorRoute(GRAPH_ENDPOINTS.move, answerMove),
  vendorRoute(GRAPH_ENDPOINTS.deleteMessage, () => vendorEmpty(204)),
  vendorRoute(GRAPH_ENDPOINTS.deleteAttachment, () => vendorEmpty(204)),
  vendorRoute(GRAPH_ENDPOINTS.createUploadSession, answerCreateUploadSession),
  vendorRoute(GRAPH_ENDPOINTS.uploadChunk, answerUploadChunk),
  vendorRoute(GRAPH_ENDPOINTS.categories, () =>
    vendorJson({
      value: [
        { id: '9b6e4f9c-0000-4000-8000-00000000c001', displayName: 'Finance', color: 'preset0' },
      ],
    }),
  ),
];
