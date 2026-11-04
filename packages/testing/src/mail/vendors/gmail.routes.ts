// packages/testing/src/mail/vendors/gmail.routes.ts
//
// Gmail REST v1 answers for the shared test mailbox. Payload shapes are trimmed copies of
// real users.threads.get / messages.get / history.list responses, ids and people replaced.
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
  MAILBOX_FIRST_MESSAGE,
  MAILBOX_NEW_MESSAGE,
  MAILBOX_REPLY,
  type MailboxMessage,
  type MailboxPerson,
} from './mailbox.fixture';

const HOST = 'gmail.googleapis.com';
const BASE = '/gmail/v1/users/me';

export const GMAIL_MAILBOX = {
  emailAddress: 'bob@example.test',
  threadId: '192a4f3c8e1b7d20',
  firstMessageId: '192a4f3c8e1b7d20',
  replyMessageId: '192a5a91c04e3f11',
  newMessageId: '192a9e07b2d5c6a4',
  attachmentId: 'ANGjdJ8wR3fakeAttachmentTokenQx1v0m6mM2lQyKk9N0bQ8hZqf7sY3c1oWp5aRtEuIyVb',
  attachmentPartId: '1',
  historyId: '4421007',
  nextHistoryId: '4421093',
  sentMessageId: '192aa1d0f7e34b58',
  draftId: 'r-5810274638491027364',
} as const;

export const GMAIL_ENDPOINTS = {
  profile: { method: 'GET', host: HOST, path: new RegExp(`^${BASE}/profile$`) },
  threadList: { method: 'GET', host: HOST, path: new RegExp(`^${BASE}/threads$`) },
  thread: { method: 'GET', host: HOST, path: new RegExp(`^${BASE}/threads/([^/]+)$`) },
  message: { method: 'GET', host: HOST, path: new RegExp(`^${BASE}/messages/([^/]+)$`) },
  attachment: {
    method: 'GET',
    host: HOST,
    path: new RegExp(`^${BASE}/messages/([^/]+)/attachments/([^/]+)$`),
  },
  send: { method: 'POST', host: HOST, path: new RegExp(`^${BASE}/messages/send$`) },
  modify: { method: 'POST', host: HOST, path: new RegExp(`^${BASE}/messages/([^/]+)/modify$`) },
  history: { method: 'GET', host: HOST, path: new RegExp(`^${BASE}/history$`) },
  draftList: { method: 'GET', host: HOST, path: new RegExp(`^${BASE}/drafts$`) },
  deleteDraft: { method: 'DELETE', host: HOST, path: new RegExp(`^${BASE}/drafts/([^/]+)$`) },
  labels: { method: 'GET', host: HOST, path: new RegExp(`^${BASE}/labels$`) },
} satisfies Record<string, VendorEndpoint>;

export const GMAIL_NOT_FOUND_BODY = {
  error: {
    code: 404,
    message: 'Requested entity was not found.',
    errors: [{ message: 'Requested entity was not found.', domain: 'global', reason: 'notFound' }],
    status: 'NOT_FOUND',
  },
};

interface GmailMessageFixture {
  id: string;
  labelIds: string[];
  message: MailboxMessage;
  messageIdHeader: string;
  inReplyTo: string | null;
  withAttachment: boolean;
}

const FIRST_MESSAGE_ID_HEADER = '<CAH7qW0fake-first@mail.gmail.com>';

const GMAIL_MESSAGES: readonly GmailMessageFixture[] = [
  {
    id: GMAIL_MAILBOX.firstMessageId,
    labelIds: ['IMPORTANT', 'CATEGORY_PERSONAL', 'INBOX'],
    message: MAILBOX_FIRST_MESSAGE,
    messageIdHeader: FIRST_MESSAGE_ID_HEADER,
    inReplyTo: null,
    withAttachment: true,
  },
  {
    id: GMAIL_MAILBOX.replyMessageId,
    labelIds: ['SENT'],
    message: MAILBOX_REPLY,
    messageIdHeader: '<CAH7qW0fake-reply@mail.gmail.com>',
    inReplyTo: FIRST_MESSAGE_ID_HEADER,
    withAttachment: false,
  },
  {
    id: GMAIL_MAILBOX.newMessageId,
    labelIds: ['UNREAD', 'IMPORTANT', 'CATEGORY_PERSONAL', 'INBOX'],
    message: MAILBOX_NEW_MESSAGE,
    messageIdHeader: '<CAH7qW0fake-new@mail.gmail.com>',
    inReplyTo: FIRST_MESSAGE_ID_HEADER,
    withAttachment: false,
  },
];

/** Messages in the thread before the next sync brings the new one. */
const THREAD_MESSAGE_IDS: readonly string[] = [
  GMAIL_MAILBOX.firstMessageId,
  GMAIL_MAILBOX.replyMessageId,
];

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function formatPerson(person: MailboxPerson): string {
  return `${person.name} <${person.address}>`;
}

function topLevelHeaders(fixture: GmailMessageFixture): Array<{ name: string; value: string }> {
  const { message } = fixture;
  const headers = [
    { name: 'MIME-Version', value: '1.0' },
    { name: 'Date', value: message.sentAt.toUTCString().replace('GMT', '+0000') },
    { name: 'Message-ID', value: fixture.messageIdHeader },
    { name: 'Subject', value: message.subject },
    { name: 'From', value: formatPerson(message.from) },
    { name: 'To', value: message.to.map(formatPerson).join(', ') },
    {
      name: 'Content-Type',
      value: fixture.withAttachment
        ? 'multipart/mixed; boundary="000000000000a1b2c3"'
        : 'multipart/alternative; boundary="000000000000d4e5f6"',
    },
  ];
  if (fixture.inReplyTo) {
    headers.push({ name: 'In-Reply-To', value: fixture.inReplyTo });
    headers.push({ name: 'References', value: fixture.inReplyTo });
  }
  return headers;
}

function alternativeParts(text: string, partIdPrefix: string) {
  const html = `<div dir="ltr">${text}</div>\r\n`;
  return [
    {
      partId: `${partIdPrefix}0`,
      mimeType: 'text/plain',
      filename: '',
      headers: [{ name: 'Content-Type', value: 'text/plain; charset="UTF-8"' }],
      body: { size: text.length, data: base64Url(`${text}\r\n`) },
    },
    {
      partId: `${partIdPrefix}1`,
      mimeType: 'text/html',
      filename: '',
      headers: [{ name: 'Content-Type', value: 'text/html; charset="UTF-8"' }],
      body: { size: html.length, data: base64Url(html) },
    },
  ];
}

function attachmentPart() {
  return {
    partId: GMAIL_MAILBOX.attachmentPartId,
    mimeType: MAILBOX_ATTACHMENT.mimeType,
    filename: MAILBOX_ATTACHMENT.filename,
    headers: [
      {
        name: 'Content-Type',
        value: `${MAILBOX_ATTACHMENT.mimeType}; name="${MAILBOX_ATTACHMENT.filename}"`,
      },
      {
        name: 'Content-Disposition',
        value: `attachment; filename="${MAILBOX_ATTACHMENT.filename}"`,
      },
      { name: 'Content-Transfer-Encoding', value: 'base64' },
      { name: 'X-Attachment-Id', value: 'f_m1x2fake0' },
    ],
    body: {
      attachmentId: GMAIL_MAILBOX.attachmentId,
      size: MAILBOX_ATTACHMENT.bytes.byteLength,
    },
  };
}

function fullPayload(fixture: GmailMessageFixture) {
  const headers = topLevelHeaders(fixture);
  if (!fixture.withAttachment) {
    return {
      partId: '',
      mimeType: 'multipart/alternative',
      filename: '',
      headers,
      body: { size: 0 },
      parts: alternativeParts(fixture.message.text, ''),
    };
  }

  return {
    partId: '',
    mimeType: 'multipart/mixed',
    filename: '',
    headers,
    body: { size: 0 },
    parts: [
      {
        partId: '0',
        mimeType: 'multipart/alternative',
        filename: '',
        headers: [
          { name: 'Content-Type', value: 'multipart/alternative; boundary="000000000000d4e5f6"' },
        ],
        body: { size: 0 },
        parts: alternativeParts(fixture.message.text, '0.'),
      },
      attachmentPart(),
    ],
  };
}

function messageResource(fixture: GmailMessageFixture, format: string | null) {
  const payload =
    format === 'metadata'
      ? { mimeType: fullPayload(fixture).mimeType, headers: topLevelHeaders(fixture) }
      : fullPayload(fixture);

  return {
    id: fixture.id,
    threadId: GMAIL_MAILBOX.threadId,
    labelIds: fixture.labelIds,
    snippet: fixture.message.text,
    historyId: GMAIL_MAILBOX.historyId,
    internalDate: String(fixture.message.sentAt.getTime()),
    sizeEstimate: 6512,
    payload,
  };
}

function findMessage(id: string | undefined): GmailMessageFixture | undefined {
  return GMAIL_MESSAGES.find((fixture) => fixture.id === id);
}

function notFound(): Response {
  return vendorJson(GMAIL_NOT_FOUND_BODY, { status: 404 });
}

interface GmailModifyBody {
  addLabelIds?: string[];
  removeLabelIds?: string[];
}

function parseModifyBody(request: VendorRequest): GmailModifyBody {
  const parsed: GmailModifyBody = JSON.parse(request.body ?? '{}');
  return parsed;
}

function answerModify(request: VendorRequest, match: RegExpMatchArray): Response {
  const fixture = findMessage(match[1]);
  if (!fixture) return notFound();

  const body = parseModifyBody(request);
  const removed = new Set(body.removeLabelIds ?? []);
  const kept = fixture.labelIds.filter((label) => !removed.has(label));
  const labelIds = Array.from(new Set(kept.concat(body.addLabelIds ?? [])));
  return vendorJson({ id: fixture.id, threadId: GMAIL_MAILBOX.threadId, labelIds });
}

function answerThread(request: VendorRequest, match: RegExpMatchArray): Response {
  if (match[1] !== GMAIL_MAILBOX.threadId) return notFound();

  const format = request.url.searchParams.get('format');
  const messages = GMAIL_MESSAGES.filter((fixture) => THREAD_MESSAGE_IDS.includes(fixture.id));
  return vendorJson({
    id: GMAIL_MAILBOX.threadId,
    historyId: GMAIL_MAILBOX.historyId,
    messages: messages.map((fixture) => messageResource(fixture, format)),
  });
}

function answerHistory(request: VendorRequest): Response {
  const startHistoryId = request.url.searchParams.get('startHistoryId');
  if (startHistoryId !== GMAIL_MAILBOX.historyId) {
    return vendorJson({ historyId: GMAIL_MAILBOX.nextHistoryId });
  }

  const added = findMessage(GMAIL_MAILBOX.newMessageId);
  return vendorJson({
    history: [
      {
        id: '4421090',
        messages: [{ id: GMAIL_MAILBOX.newMessageId, threadId: GMAIL_MAILBOX.threadId }],
        messagesAdded: [
          {
            message: {
              id: GMAIL_MAILBOX.newMessageId,
              threadId: GMAIL_MAILBOX.threadId,
              labelIds: added?.labelIds ?? [],
            },
          },
        ],
      },
    ],
    historyId: GMAIL_MAILBOX.nextHistoryId,
  });
}

export const GMAIL_MAILBOX_ROUTES: readonly VendorRoute[] = [
  vendorRoute(GMAIL_ENDPOINTS.profile, () =>
    vendorJson({
      emailAddress: GMAIL_MAILBOX.emailAddress,
      messagesTotal: 1842,
      threadsTotal: 1210,
      historyId: GMAIL_MAILBOX.historyId,
    }),
  ),
  vendorRoute(GMAIL_ENDPOINTS.threadList, () =>
    vendorJson({
      threads: [
        {
          id: GMAIL_MAILBOX.threadId,
          snippet: MAILBOX_REPLY.text,
          historyId: GMAIL_MAILBOX.historyId,
        },
      ],
      resultSizeEstimate: 1,
    }),
  ),
  vendorRoute(GMAIL_ENDPOINTS.thread, answerThread),
  vendorRoute(GMAIL_ENDPOINTS.message, (request, match) => {
    const fixture = findMessage(match[1]);
    if (!fixture) return notFound();
    return vendorJson(messageResource(fixture, request.url.searchParams.get('format')));
  }),
  vendorRoute(GMAIL_ENDPOINTS.attachment, (_request, match) => {
    if (match[1] !== GMAIL_MAILBOX.firstMessageId || match[2] !== GMAIL_MAILBOX.attachmentId) {
      return notFound();
    }
    return vendorJson({
      size: MAILBOX_ATTACHMENT.bytes.byteLength,
      data: base64Url(MAILBOX_ATTACHMENT.bytes),
    });
  }),
  vendorRoute(GMAIL_ENDPOINTS.send, () =>
    vendorJson({
      id: GMAIL_MAILBOX.sentMessageId,
      threadId: GMAIL_MAILBOX.sentMessageId,
      labelIds: ['SENT'],
    }),
  ),
  vendorRoute(GMAIL_ENDPOINTS.modify, answerModify),
  vendorRoute(GMAIL_ENDPOINTS.history, answerHistory),
  vendorRoute(GMAIL_ENDPOINTS.draftList, () => vendorJson({ resultSizeEstimate: 0 })),
  vendorRoute(GMAIL_ENDPOINTS.deleteDraft, () => vendorEmpty(204)),
  vendorRoute(GMAIL_ENDPOINTS.labels, () =>
    vendorJson({
      labels: [
        { id: 'INBOX', name: 'INBOX', type: 'system' },
        { id: 'Label_7', name: 'Finance', type: 'user' },
      ],
    }),
  ),
];
