import type { SocialPost } from '@repo/database';
import {
  createSocialPost,
  getSocialPostById,
  updateSocialPostContent,
} from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';

export type DraftLinkedInPostInput = {
  userId: string;
  text: string;
  /** Revise this existing draft instead of creating a new one. */
  draftId?: string;
};

export type DraftLinkedInPostResult =
  | { id: string; status: SocialPost['status'] }
  | { error: string };

// LinkedIn's own limit. Enforced here rather than only in the tool's Zod
// schema, because the workflow tool node calls this service directly with a
// resolved template string, skipping that schema entirely.
const LINKEDIN_POST_MAX_LENGTH = 3000;

function validatePostText(text: string): string | null {
  if (text.length < 1) {
    return 'The post content cannot be empty.';
  }
  if (text.length > LINKEDIN_POST_MAX_LENGTH) {
    return `The post content must be at most ${LINKEDIN_POST_MAX_LENGTH} characters (LinkedIn's limit).`;
  }
  return null;
}

/**
 * Creates a new LinkedIn draft, or revises an existing one, for the agent's
 * `linkedinDraft` tool. This is a pure DB write: publishing needs a token and
 * happens later, only when the user triggers it.
 */
export async function draftLinkedInPost({
  userId,
  text,
  draftId,
}: DraftLinkedInPostInput): Promise<DraftLinkedInPostResult> {
  const validationError = validatePostText(text);
  if (validationError) {
    return { error: validationError };
  }

  if (draftId) {
    return reviseDraft({ userId, text, draftId });
  }

  const { error, data: created } = await tryCatch(() =>
    createSocialPost({ userId, platform: 'linkedin', content: text, source: 'agent' }),
  );

  if (error !== null || !created) {
    logger.error('Failed to create LinkedIn draft', { error });
    return { error: 'Failed to create the LinkedIn draft.' };
  }

  return { id: created.id, status: created.status };
}

async function reviseDraft({
  userId,
  text,
  draftId,
}: {
  userId: string;
  text: string;
  draftId: string;
}): Promise<DraftLinkedInPostResult> {
  const { error: findError, data: existing } = await tryCatch(() =>
    getSocialPostById({ id: draftId, userId }),
  );

  if (findError !== null) {
    logger.error('Failed to load LinkedIn draft', { findError });
    return { error: 'Failed to load the existing draft.' };
  }

  if (!existing) {
    return { error: 'Draft not found.' };
  }

  if (existing.status !== 'draft') {
    return { error: `Only drafts can be revised. This post is already ${existing.status}.` };
  }

  const { error: updateError, data: updated } = await tryCatch(() =>
    updateSocialPostContent({ id: draftId, userId, content: text }),
  );

  if (updateError !== null || !updated) {
    logger.error('Failed to update LinkedIn draft', { updateError });
    return { error: 'Failed to update the draft.' };
  }

  return { id: updated.id, status: updated.status };
}
