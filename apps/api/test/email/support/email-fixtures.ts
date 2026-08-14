// apps/api/test/email/support/email-fixtures.ts
//
// Shared setup helpers for the email domain test suite. Most tests need a
// connected Gmail account before hitting any other /email route, so
// `seedConnectedGmailAccount` drives that through the real
// `POST /email/account/connect` endpoint (seeding the linked Google account
// first via gmail-account-fixtures.ts) rather than inserting an
// `email_accounts` row by hand - this exercises the connect flow itself
// (default categories, enqueue) the same way every other domain's fixtures
// go through the real API where practical (e.g. media/chat-attachments.
// test.ts's createAgent/createChat).
//
// Threads/messages/bodies are seeded directly through @repo/database's repo
// functions instead: they model data the *sync poller* would have written,
// which is out of scope for apps/api's own test suite (docs/email/prd.md,
// "Worker jobs"), so going through the real API isn't an option here.
import type { EmailAccount, EmailDraft, EmailDraftStatus, EmailParticipant, EmailThread } from '@repo/database';
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

export interface ConnectedGmailAccount {
  userId: string;
  accountId: string;
  email: string;
}

/**
 * Links a Google account with the gmail.modify scope, then drives the real
 * connect endpoint (seeds default categories + enqueues the initial sync,
 * email.service.ts's connectEmailAccount).
 */
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

  if (email) {
    getProfileMock.mockImplementationOnce(() => Promise.resolve({ emailAddress: email, cursor: 'history-cursor-0' }));
  }

  const response = await app.request('/email/account/connect', {
    method: 'POST',
    headers: { cookie: cookieHeader },
  });

  if (response.status !== 201) {
    throw new Error(`seedConnectedGmailAccount: connect failed with status ${response.status}`);
  }

  const body = z
    .object({ account: z.object({ id: z.string(), email: z.string() }) })
    .parse(await response.json());

  return { userId, accountId: body.account.id, email: body.account.email };
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
 * mail (docs/email/prd.md, "Sync model"). `withBody: false` sets up the
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

/** Directly inserts an email_drafts row, e.g. for edit/discard/send lifecycle tests. */
export function seedEmailDraft(params: {
  accountId: string;
  threadId: string;
  agentId: string;
  replyToMessageId?: string;
  content?: string;
  status?: EmailDraftStatus;
}): Promise<EmailDraft> {
  return createEmailDraft({
    accountId: params.accountId,
    threadId: params.threadId,
    agentId: params.agentId,
    replyToMessageId: params.replyToMessageId ?? null,
    content: params.content ?? 'Draft reply content.',
    status: params.status ?? 'ready',
  });
}

export type { EmailAccount };
