// packages/mail/src/content/thread-prompt.ts
//
// Shared thread-to-prompt formatter for classify and draft. Takes a plain
// input shape rather than DB row types, so callers don't couple this
// package to @repo/database's schema.

import type { MailAddress } from '../provider/mail-provider';
import { formatMailAddress } from './mail-address-display';
import { stripQuotedReply } from './quoted-reply';

export interface ThreadPromptMessageInput {
  from: MailAddress;
  date: Date;
  subject: string | null;
  text: string;
}

export interface ThreadPromptOptions {
  /** Character budget for the assembled prompt (a proxy for tokens; caller picks the ratio). */
  maxCharacters: number;
}

const DEFAULT_OPTIONS: ThreadPromptOptions = { maxCharacters: Number.POSITIVE_INFINITY };

/** Thrown when the newest message alone exceeds `maxCharacters` — there's no older content left to drop. */
export class MessageExceedsPromptBudgetError extends Error {
  constructor(characters: number, maxCharacters: number) {
    super(
      `Message body is ${characters} characters, exceeds the ${maxCharacters} character prompt budget`,
    );
    this.name = 'MessageExceedsPromptBudgetError';
  }
}

/** Renders `messages` oldest-to-newest into one prompt string, budgeted by `options.maxCharacters`. */
export function formatThreadForPrompt(
  messages: ThreadPromptMessageInput[],
  options: ThreadPromptOptions = DEFAULT_OPTIONS,
): string {
  const blocks = messages.map(formatMessageBlock);
  const kept = keepWithinBudget(blocks, options.maxCharacters);
  const droppedCount = blocks.length - kept.length;
  const notice = droppedCount > 0 ? formatDroppedNotice(droppedCount) : '';

  return notice + kept.join('\n\n---\n\n');
}

// Walks newest-to-oldest; the newest message must fit the budget alone
// (throws otherwise), then stops at the first older message that would
// overflow it, so the kept set is a contiguous, most-recent suffix.
function keepWithinBudget(blocks: string[], maxCharacters: number): string[] {
  const kept: string[] = [];
  let usedCharacters = 0;

  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];

    if (kept.length === 0) {
      if (block.length > maxCharacters) {
        throw new MessageExceedsPromptBudgetError(block.length, maxCharacters);
      }
      kept.unshift(block);
      usedCharacters += block.length;
      continue;
    }

    if (usedCharacters + block.length <= maxCharacters) {
      kept.unshift(block);
      usedCharacters += block.length;
      continue;
    }

    break;
  }

  return kept;
}

function formatMessageBlock(message: ThreadPromptMessageInput): string {
  const subjectLine = message.subject ? `Subject: ${message.subject}\n` : '';
  const body = stripQuotedReply(message.text).trim();

  return `From: ${formatMailAddress(message.from)}\nDate: ${message.date.toISOString()}\n${subjectLine}\n${body}`;
}

function formatDroppedNotice(count: number): string {
  return `[${count} earlier message${count === 1 ? '' : 's'} omitted for length]\n\n`;
}
