// packages/testing/src/mail/vendors/mailbox.fixture.ts
//
// The mailbox every vendor fake serves, in vendor-neutral terms. Each vendor's routes
// encode it in that vendor's wire format, so the mail contract suite can assert the
// same parsed result for every vendor.

export interface MailboxPerson {
  name: string;
  address: string;
}

export interface MailboxAttachment {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

export interface MailboxMessage {
  from: MailboxPerson;
  to: MailboxPerson[];
  subject: string;
  text: string;
  sentAt: Date;
}

export const MAILBOX_ALICE: MailboxPerson = {
  name: 'Alice Example',
  address: 'alice@example.test',
};
export const MAILBOX_BOB: MailboxPerson = { name: 'Bob Example', address: 'bob@example.test' };

export const MAILBOX_SUBJECT = 'Quarterly report';

export const MAILBOX_FIRST_MESSAGE: MailboxMessage = {
  from: MAILBOX_ALICE,
  to: [MAILBOX_BOB],
  subject: MAILBOX_SUBJECT,
  text: 'Hi Bob, the quarterly report is attached.',
  sentAt: new Date('2026-10-02T08:15:00.000Z'),
};

export const MAILBOX_REPLY: MailboxMessage = {
  from: MAILBOX_BOB,
  to: [MAILBOX_ALICE],
  subject: `Re: ${MAILBOX_SUBJECT}`,
  text: 'Thanks Alice, I will read it today.',
  sentAt: new Date('2026-10-02T09:40:00.000Z'),
};

/** Arrives after the initial sync, in the same thread. */
export const MAILBOX_NEW_MESSAGE: MailboxMessage = {
  from: MAILBOX_ALICE,
  to: [MAILBOX_BOB],
  subject: `Re: ${MAILBOX_SUBJECT}`,
  text: 'One more number changed on page 3.',
  sentAt: new Date('2026-10-03T07:05:00.000Z'),
};

export const MAILBOX_ATTACHMENT: MailboxAttachment = {
  filename: 'q3-report.pdf',
  mimeType: 'application/pdf',
  bytes: Buffer.from('%PDF-1.7 fake quarterly report'),
};

export const MAILBOX_SEARCH_QUERY = 'quarterly report';
