import * as z from 'zod';
import { draftLinkedInPost } from '../services/social-post.service';
import type { ToolDefinition, ToolFailure } from './tool-definition';

const linkedinDraftInputSchema = z.object({
  text: z
    .string()
    .min(1)
    .max(3000)
    .describe("The LinkedIn post content. Max 3000 characters, LinkedIn's limit."),
  draftId: z
    .string()
    .optional()
    .describe(
      'ID of an existing draft to revise instead of creating a new one. Omit to create a new draft.',
    ),
  imageIds: z
    .array(z.string())
    .max(9)
    .optional()
    .describe(
      "IDs of images generated earlier in this conversation with the imageGen tool, to attach to the post. Max 9 images, LinkedIn's limit. When revising a draft, this replaces its current images; omit it to leave them unchanged.",
    ),
});

interface LinkedinDraftSaved {
  id: string;
  status: string;
}

type LinkedinDraftOutput = LinkedinDraftSaved | ToolFailure<'rejected'>;

export const linkedinDraftToolDefinition: ToolDefinition<
  typeof linkedinDraftInputSchema,
  LinkedinDraftOutput
> = {
  name: 'linkedinDraft',
  description:
    'Use this tool to create or revise a LinkedIn post draft for the user. It only saves the draft; it never publishes to LinkedIn. The user reviews and publishes drafts themselves. Pass imageIds to attach up to 9 images that were generated earlier with the imageGen tool.',
  inputSchema: linkedinDraftInputSchema,
  access: 'write',
  execute: async ({ text, draftId, imageIds }, { userId, workspaceId }) => {
    const result = await draftLinkedInPost({ userId, text, draftId, imageIds, workspaceId });
    // The service words its errors for the model and logs the internal cause itself.
    if ('error' in result) {
      return { status: 'rejected', message: result.error };
    }
    return { id: result.id, status: result.status };
  },
};
