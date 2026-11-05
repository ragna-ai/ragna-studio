import { isToolUIPart, type UIMessage } from '@repo/ai';
import * as z from 'zod';
import { BadRequestException } from '../exceptions';

const clientApprovalsSchema = z.object({
  parts: z.array(
    z.looseObject({
      state: z.string().optional(),
      approval: z.looseObject({ id: z.string(), approved: z.boolean().optional() }).optional(),
    }),
  ),
});

/** Approval ids the client answered, with its decision. Everything else it sent is dropped. */
function readClientDecisions(clientMessage: unknown): Map<string, boolean> {
  const decisions = new Map<string, boolean>();
  const parsed = clientApprovalsSchema.safeParse(clientMessage);
  if (!parsed.success) return decisions;

  for (const part of parsed.data.parts) {
    if (part.state !== 'approval-responded') continue;
    if (part.approval?.approved === undefined) continue;
    decisions.set(part.approval.id, part.approval.approved);
  }
  return decisions;
}

function hasPendingApproval(message: UIMessage): boolean {
  return message.parts.some((part) => isToolUIPart(part) && part.state === 'approval-requested');
}

/**
 * Applies the client's decisions to the approvals the server stored as pending on the
 * last assistant message, then refuses to continue while any approval is still open.
 * Only the decision is taken from the client: tool input and signature stay as
 * persisted, and an id the server did not issue changes nothing.
 * Mutates the last message of `history`, which is the caller's own copy.
 */
export function answerPendingApprovals(history: UIMessage[], clientMessage: unknown): void {
  const last = history.at(-1);
  if (last?.role !== 'assistant') return;

  const decisions = readClientDecisions(clientMessage);
  for (const [index, part] of last.parts.entries()) {
    if (!isToolUIPart(part) || part.state !== 'approval-requested') continue;
    const approved = decisions.get(part.approval.id);
    if (approved === undefined) continue;
    last.parts[index] = {
      ...part,
      state: 'approval-responded',
      approval: { ...part.approval, approved },
    };
  }

  if (hasPendingApproval(last)) {
    throw new BadRequestException('A tool call is waiting for approval');
  }
}

/**
 * A new user message while approvals are open means the user passed on them.
 * Marks each as denied so the model sees a denial and nothing is written.
 * Returns the messages it changed, for the caller to persist.
 */
export function denyOpenApprovals(history: UIMessage[]): UIMessage[] {
  const changed: UIMessage[] = [];
  for (const message of history) {
    let touched = false;
    for (const [index, part] of message.parts.entries()) {
      if (!isToolUIPart(part) || part.state !== 'approval-requested') continue;
      message.parts[index] = {
        ...part,
        state: 'output-denied',
        approval: { ...part.approval, approved: false },
      };
      touched = true;
    }
    if (touched) changed.push(message);
  }
  return changed;
}
