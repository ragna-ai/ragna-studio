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
// Shared quote-stripping thread-to-prompt formatter (docs/email/prd.md,
// "Content pipeline"), also used by the draft context builder. A single
// message here still benefits from quote-stripping: a reply's quoted tail
// shouldn't sway the category.
import { formatThreadForPrompt } from '@repo/mail/content';
import type { EmailClassifyJobData } from '@repo/queue';
import { EMAIL_DRAFT_JOB, EmailDraftJobDto, queue } from '@repo/queue';
import { getGmailProviderForAccount } from './gmail-provider';
import { ensureMessageBody } from './message-body';
import { toMailAddress } from './participants';

// Same model/precedent as apps/api's chat.service.ts generateChatTitle:
// Haiku-tier, uncredited "invisible spend" (docs/credits/prd.md, "Non-goals"
// explicitly names generateChatTitle as this pattern; v1's credit system
// only prices chat and workflow/team agent runs). Classification is the
// same shape of cheap, high-volume utility call, so it stays uncharged
// rather than inventing new credit infrastructure for it.
const CLASSIFY_MODEL = 'claude-haiku-4-5';
const NO_MATCH = 'NONE';
const MAX_CLASSIFY_CHARS = 4000;

// Structured output with the category NAMES as an enum: the schema makes a
// truncated, typo'd, or chatty answer unrepresentable (the earlier
// free-text variant asked for the category id and got UUIDs cut off by the
// output cap). Names, not ids, because they are meaningful labels to the
// model and unique per account by DB constraint.
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

  const category = await classifyBestEffort({ message, text: body.textBody, categories });
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
  const excerpt = formatThreadForPrompt(
    [
      {
        from: toMailAddress(message.from),
        date: message.sentAt,
        subject: message.subject,
        text: text ?? message.snippet ?? '',
      },
    ],
    { maxCharacters: MAX_CLASSIFY_CHARS },
  );

  const categoryList = categories
    .map((category) => `${category.name}: ${category.description}`)
    .join('\n');

  const categoryNames = [NO_MATCH, ...categories.map((category) => category.name)];

  const { output } = await generateText({
    model: getLanguageModel({ provider: 'anthropic', model: CLASSIFY_MODEL }),
    instructions: CLASSIFY_SYSTEM_PROMPT,
    output: Output.object({
      schema: z.object({ category: z.enum(categoryNames) }),
    }),
    prompt: `<categories>\n${categoryList}\n</categories>\n\n<email>\n${excerpt}\n</email>`,
  });

  logger.debug(
    `Email classification model response for message ${message.id}: "${output.category}"`,
  );
  if (output.category === NO_MATCH) {
    return null;
  }

  return categories.find((category) => category.name === output.category)?.id ?? null;
}
