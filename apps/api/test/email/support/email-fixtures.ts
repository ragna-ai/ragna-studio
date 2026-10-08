// apps/api/test/email/support/email-fixtures.ts
import type {
  EmailAccount,
  EmailDraft,
  EmailDraftAttachment,
  EmailDraftKind,
  EmailDraftOrigin,
  EmailDraftStatus,
  EmailMessageFolder,
  EmailParticipant,
  EmailThread,
} from '@repo/database';
import {
  createEmailDraft,
  upsertEmailMessageBody,
  upsertEmailMessageByProviderMessageId,
  upsertEmailThreadByProviderThreadId,
} from '@repo/database';
import { seedTokenPricedAiModel } from '@repo/testing';
import * as z from 'zod';
import { app } from '../../../src/app';
import { seedGmailLinkedAccount } from './gmail-account-fixtures';
import { getProfileMock } from './mail-provider.mock';
import { seedMicrosoftLinkedAccount } from './microsoft-account-fixtures';

export interface ConnectedGmailAccount {
  userId: string;
  accountId: string;
  email: string;
}

interface ConnectEmailAccountResult {
  accountId: string;
  email: string;
}

async function connectEmailAccountRequest({
  cookieHeader,
  provider,
  email,
}: {
  cookieHeader: string;
  provider: 'gmail' | 'microsoft';
  email?: string;
}): Promise<ConnectEmailAccountResult> {
  if (email) {
    getProfileMock.mockImplementationOnce(() => Promise.resolve({ emailAddress: email, cursor: 'history-cursor-0' }));
  }

  const response = await app.request('/email/account/connect', {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ provider }),
  });

  if (response.status !== 201) {
    throw new Error(`connectEmailAccountRequest: connect failed with status ${response.status}`);
  }

  const body = z
    .object({ account: z.object({ id: z.string(), email: z.string() }) })
    .parse(await response.json());

  return { accountId: body.account.id, email: body.account.email };
}

export async function seedConnectedGmailAccount({
  userId,
  cookieHeader,
  email,
}: {
  userId: string;
  cookieHeader: string;
  email?: string;
}): Promise<ConnectedGmailAccount> {
  await seedGmailLinkedAccount({ userId });
  const connected = await connectEmailAccountRequest({ cookieHeader, provider: 'gmail', email });

  return { userId, ...connected };
}

export async function seedConnectedMicrosoftAccount({
  userId,
  cookieHeader,
  email,
}: {
  userId: string;
  cookieHeader: string;
  email?: string;
}): Promise<ConnectedGmailAccount> {
  await seedMicrosoftLinkedAccount({ userId });
  const connected = await connectEmailAccountRequest({ cookieHeader, provider: 'microsoft', email });

  return { userId, ...connected };
}

export async function createAgentForWorkspace(cookieHeader: string, workspaceId: string): Promise<string> {
  const { aiModelId } = await seedTokenPricedAiModel();

  const response = await app.request(`/workspace/${workspaceId}/agent`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Draft Agent', aiModelId, systemPrompt: 'You draft email replies.' }),
  });

  const body = z.object({ agent: z.object({ id: z.string() }) }).parse(await response.json());
  return body.agent.id;
}

export interface SeedThreadWithMessageParams {
  accountId: string;
  providerThreadId?: string;
  providerMessageId?: string;
  subject?: string;
  snippet?: string;
  from?: EmailParticipant;
  to?: EmailParticipant[];
  labelIds?: string[];
  folder?: EmailMessageFolder;
  isUnread?: boolean;
  isStarred?: boolean;
  categoryId?: string;
  sentAt?: Date;
  /** Set false to leave the message body unpersisted (the "lazy body" gap case). */
  withBody?: boolean;
  textBody?: string;
  htmlBody?: string;
}

export interface SeededThreadWithMessage {
  thread: EmailThread;
  messageId: string;
  providerMessageId: string;
  providerThreadId: string;
}

/**
 * Directly inserts one thread + one message (+ optionally its body),
 * modeling what the sync poller would have written for a piece of existing
 * mail. `withBody: false` sets up the
 * lazy-persistence gap: a message row with no `email_message_bodies` row
 * yet, so `getEmailThreadDetailForUser` has to live-fetch it.
 */
export async function seedEmailThreadWithMessage(
  params: SeedThreadWithMessageParams,
): Promise<SeededThreadWithMessage> {
  const providerThreadId = params.providerThreadId ?? `provider-thread-${crypto.randomUUID()}`;
  const providerMessageId = params.providerMessageId ?? `provider-message-${crypto.randomUUID()}`;
  const sentAt = params.sentAt ?? new Date();
  const from = params.from ?? { name: 'Sender', email: 'sender@example.test' };
  const to = params.to ?? [{ name: 'Recipient', email: 'recipient@example.test' }];

  const thread = await upsertEmailThreadByProviderThreadId({
    accountId: params.accountId,
    providerThreadId,
    subject: params.subject ?? 'Test subject',
    snippet: params.snippet ?? 'Test snippet',
    lastMessageAt: sentAt,
    participants: [from, ...to],
  });

  const message = await upsertEmailMessageByProviderMessageId({
    accountId: params.accountId,
    threadId: thread.id,
    providerMessageId,
    from,
    to,
    cc: [],
    subject: params.subject ?? 'Test subject',
    snippet: params.snippet ?? 'Test snippet',
    sentAt,
    isUnread: params.isUnread ?? true,
    isStarred: params.isStarred ?? false,
    folder: params.folder ?? 'inbox',
    labelIds: params.labelIds ?? ['INBOX'],
    categoryId: params.categoryId ?? null,
  });

  if (params.withBody ?? true) {
    await upsertEmailMessageBody({
      messageId: message.id,
      textBody: params.textBody ?? 'Hello, this is a seeded message body.',
      htmlBody: params.htmlBody ?? '<p>Hello, this is a seeded message body.</p>',
    });
  }

  return { thread, messageId: message.id, providerMessageId, providerThreadId };
}

/**
 * Directly inserts an email_drafts row, e.g. for edit/discard/send lifecycle
 * tests. Defaults to an AI reply draft (origin/kind), the shape every
 * pre-drafts-change-request test in this suite already seeds; pass
 * `origin`/`kind`/`to`/`providerDraftId`/etc. to model a user draft or one
 * already pushed to Gmail.
 */
export function seedEmailDraft(params: {
  accountId: string;
  threadId?: string | null;
  agentId?: string | null;
  origin?: EmailDraftOrigin;
  kind?: EmailDraftKind;
  replyToMessageId?: string;
  to?: EmailParticipant[];
  subject?: string | null;
  content?: string;
  /** Plain-text MIME sibling of `content`. */
  text?: string;
  /** Read-only quoted history, split out of content/text. */
  quotedHtml?: string | null;
  quotedText?: string | null;
  attachments?: EmailDraftAttachment[];
  status?: EmailDraftStatus;
  providerDraftId?: string;
}): Promise<EmailDraft> {
  return createEmailDraft({
    accountId: params.accountId,
    origin: params.origin ?? 'ai',
    kind: params.kind ?? 'reply',
    threadId: params.threadId ?? null,
    agentId: params.agentId ?? null,
    replyToMessageId: params.replyToMessageId ?? null,
    to: params.to ?? [],
    subject: params.subject ?? null,
    content: params.content ?? '<p>Draft reply content.</p>',
    text: params.text ?? 'Draft reply content.',
    quotedHtml: params.quotedHtml ?? null,
    quotedText: params.quotedText ?? null,
    attachments: params.attachments ?? [],
    status: params.status ?? 'ready',
    providerDraftId: params.providerDraftId ?? null,
  });
}

export type { EmailAccount };
