// apps/worker/src/mail/message-body.ts
//
// Lazy body persistence: the first fetch for any reason stores the
// canonical LLM-facing text (plain-text part preferred, else markdown from
// HTML), so every later reader (thread view, classify, draft) is a plain DB
// read with no provider call. Shared by the sync seed import, the
// classifier, and the draft context builder, so there is exactly one
// lazy-persist path.

import type { EmailMessageWithBody } from '@repo/database';
import { upsertEmailMessageBody } from '@repo/database';
import type { MailBody, MailProvider } from '@repo/mail/provider';

export interface PersistedMessageBody {
  textBody: string | null;
  htmlBody: string | null;
}

export function toPersistedBody(body: MailBody): PersistedMessageBody {
  return { textBody: body.text, htmlBody: body.html };
}

// Callers (classify, draft) load messages via getEmailMessageWithBodyById /
// listEmailMessagesByThreadId, both of which already join the stored body,
// so the "is it stored?" check is just reading `.body` off what they
// already fetched — no extra round trip to find that out.
export async function ensureMessageBody({
  provider,
  message,
}: {
  provider: MailProvider;
  message: EmailMessageWithBody;
}): Promise<PersistedMessageBody> {
  if (message.body) {
    return { textBody: message.body.textBody, htmlBody: message.body.htmlBody };
  }

  const full = await provider.fetchMessage(message.providerMessageId, 'full');
  return persistMessageBody({ messageId: message.id, body: full.body });
}

export async function persistMessageBody({
  messageId,
  body,
}: {
  messageId: string;
  body: MailBody;
}): Promise<PersistedMessageBody> {
  const persisted = toPersistedBody(body);
  await upsertEmailMessageBody({
    messageId,
    textBody: persisted.textBody,
    htmlBody: persisted.htmlBody,
  });
  return persisted;
}
