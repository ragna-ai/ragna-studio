// packages/mail/src/content/thread-prompt.ts
//
// Shared thread-to-prompt formatter for classify, draft, and (later) the
// agent email tool (docs/email/prd.md, "Content pipeline" / "LLM reading").
// Deliberately takes a plain input shape rather than DB row types, so
// callers in apps/api and apps/worker don't couple this package to
// @repo/database's schema.

import type { MailAddress } from '../provider/mail-provider';
import { formatMailAddress } from './mail-address-display';
import { stripQuotedReply } from './quoted-reply';

export interface ThreadPromptMessageInput {
  from: MailAddress;
  date: Date;
  subject: string | null;
  markdownBody: string;
}

export interface ThreadPromptOptions {
  /**
   * Character budget for the assembled prompt, oldest messages dropped
   * first. A proxy for a token budget: this package doesn't do token
   * counting, so the caller picks the char/token ratio for its model.
   */
  maxCharacters: number;
}

// No budget by default: classify's single-message excerpt and short threads
// don't need one, so callers only pass `options` when it's actually enforced.
const DEFAULT_OPTIONS: ThreadPromptOptions = { maxCharacters: Number.POSITIVE_INFINITY };

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

// Walks newest-to-oldest, always keeping the newest message even if it
// alone exceeds the budget, then stops at the first older message that
// would overflow it (everything before that is dropped as one block, so
// the kept set stays a contiguous, most-recent suffix).
function keepWithinBudget(blocks: string[], maxCharacters: number): string[] {
  const kept: string[] = [];
  let usedCharacters = 0;

  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];

    if (kept.length === 0 || usedCharacters + block.length <= maxCharacters) {
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
  const body = stripQuotedReply(message.markdownBody).trim();

  return `From: ${formatMailAddress(message.from)}\nDate: ${message.date.toISOString()}\n${subjectLine}\n${body}`;
}

function formatDroppedNotice(count: number): string {
  return `[${count} earlier message${count === 1 ? '' : 's'} omitted for length]\n\n`;
}
