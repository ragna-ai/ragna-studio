// apps/worker/src/mail/email-classify.service.ts
//
// Classifies one newly-synced message into the account's category set and
// decides whether it should auto-draft (docs/email/prd.md, "Worker jobs").
// Best-effort by design: an LLM failure leaves the message uncategorized
// rather than failing the job, so a flaky classify call never blocks the
// sync pipeline behind it.

import { generateText, getLanguageModel, Output, z } from '@repo/ai';
import type { EmailCategory, EmailMessageWithBody } from '@repo/database';
import {
  existsEmailAutoDraftSenderByEmail,
  getEmailAccountById,
  getEmailMessageWithBodyById,
  listEmailCategoriesByAccountId,
  updateEmailMessageClassification,
} from '@repo/database';
import { logger } from '@repo/logger';
import { emailBodyToText } from '@repo/mail/content';
import type { EmailClassifyJobData } from '@repo/queue';
import { EMAIL_DRAFT_JOB, EmailDraftJobDto, queue } from '@repo/queue';
import { getGmailProviderForAccount } from './gmail-provider';
import { ensureMessageBody } from './message-body';

const CLASSIFY_MODEL = 'claude-haiku-4-5';
const NO_MATCH = 'NONE';
const MAX_CLASSIFY_CHARS = 2000;

const CLASSIFY_SYSTEM_PROMPT = `You classify an email into exactly one category from a fixed list, for an inbox auto-categorization feature. Pick the single best-matching category by name. If none of the categories clearly fit, pick "${NO_MATCH}".`;

export async function classifyEmailMessage({
  accountId,
  messageId,
}: EmailClassifyJobData): Promise<void> {
  const message = await getEmailMessageWithBodyById({ id: messageId });
  if (!message) {
    logger.warn(`Email message ${messageId} not found, skipping classification`);
    return;
  }

  const account = await getEmailAccountById({ id: accountId });
  if (!account) {
    logger.warn(
      `Email account ${accountId} not found, skipping classification for message ${messageId}`,
    );
    return;
  }

  const provider = getGmailProviderForAccount(account);
  const body = await ensureMessageBody({ provider, message });
  const categories = await listEmailCategoriesByAccountId({ accountId });

  const text = emailBodyToText(body, { maxLength: MAX_CLASSIFY_CHARS });
  const category = await classifyBestEffort({ message, text, categories });
  const shouldAutoDraft = await resolvesToAutoDraft({ accountId, message, category });

  await updateEmailMessageClassification({
    id: message.id,
    categoryId: category?.id ?? null,
    needsReply: shouldAutoDraft,
  });

  if (!shouldAutoDraft) {
    return;
  }

  await queue.emailDraft().add(
    EMAIL_DRAFT_JOB,
    new EmailDraftJobDto({
      accountId,
      threadId: message.threadId,
      replyToMessageId: message.id,
    }).toJSON(),
  );
}

async function resolvesToAutoDraft({
  accountId,
  message,
  category,
}: {
  accountId: string;
  message: EmailMessageWithBody;
  category: EmailCategory | undefined;
}): Promise<boolean> {
  if (category?.autoDraft) {
    return true;
  }

  return existsEmailAutoDraftSenderByEmail({ accountId, senderEmail: message.from.email });
}

async function classifyBestEffort({
  message,
  text,
  categories,
}: {
  message: EmailMessageWithBody;
  text: string | null;
  categories: EmailCategory[];
}): Promise<EmailCategory | undefined> {
  if (categories.length === 0) {
    return undefined;
  }

  try {
    const categoryId = await classifyWithModel({ message, text, categories });
    return categoryId ? categories.find((category) => category.id === categoryId) : undefined;
  } catch (error) {
    logger.error(
      `Email classification failed for message ${message.id}, leaving uncategorized`,
      error,
    );
    return undefined;
  }
}

async function classifyWithModel({
  message,
  text,
  categories,
}: {
  message: EmailMessageWithBody;
  text: string | null;
  categories: EmailCategory[];
}): Promise<string | null> {
  // A single already-truncated message (emailBodyToText applied
  // MAX_CLASSIFY_CHARS above) doesn't need formatThreadForPrompt's
  // multi-message budget/drop logic, which was throwing
  // MessageExceedsPromptBudgetError once its own header pushed the block
  // past MAX_CLASSIFY_CHARS again.
  const from = message.from.name
    ? `${message.from.name} <${message.from.email}>`
    : message.from.email;
  const subjectLine = message.subject ? `Subject: ${message.subject}\n` : '';
  const body = text ?? message.snippet ?? '';
  const excerpt = `From: ${from}\nDate: ${message.sentAt.toISOString()}\n${subjectLine}\n${body}`;

  const categoryList = categories
    .map((category) => `${category.name}: ${category.description}`)
    .join('\n');

  const categoryNames = [NO_MATCH, ...categories.map((category) => category.name)];

  const prompt = `<categories>\n${categoryList}\n</categories>\n\n<email>\n${excerpt}\n</email>`;

  logger.debug(`Classifying email message ${message.id} with prompt ${JSON.stringify(prompt)}`);

  const { output } = await generateText({
    model: getLanguageModel({ provider: 'anthropic', model: CLASSIFY_MODEL }),
    instructions: CLASSIFY_SYSTEM_PROMPT,
    output: Output.object({
      schema: z.object({ category: z.enum(categoryNames) }),
    }),
    prompt,
  });

  logger.debug(
    `Email classification model response for message ${message.id}: "${output.category}"`,
  );
  if (output.category === NO_MATCH) {
    return null;
  }

  return categories.find((category) => category.name === output.category)?.id ?? null;
}
