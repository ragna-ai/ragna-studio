import type {
  InferToolInput,
  InferToolOutput,
  InferUITool,
  Tool,
  UIMessage,
  UIMessageStreamWriter,
} from 'ai';
import { tool } from 'ai';
import * as z from 'zod';
import { draftLinkedInPost } from '../services/social-post.service';

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
});

type LinkedinDraftInput = z.infer<typeof linkedinDraftInputSchema>;

type LinkedinDraftOutput = { id: string; status: string } | { error: string };

export const getLinkedinDraft = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  userId: string,
): Tool<LinkedinDraftInput, LinkedinDraftOutput> =>
  tool({
    description:
      'Use this tool to create or revise a LinkedIn post draft for the user. It only saves the draft; it never publishes to LinkedIn. The user reviews and publishes drafts themselves.',
    inputSchema: linkedinDraftInputSchema,
    execute: async ({ text, draftId }) => {
      // emit tool usage message
      writer.write({
        type: 'data-linkedinDraft',
        data: { text, draftId },
        transient: true,
      });

      // only id and status go back into the model context; the full record stays in the DB
      return draftLinkedInPost({ userId, text, draftId });
    },
  });

export type getLinkedinDraftInput = InferToolInput<ReturnType<typeof getLinkedinDraft>>;
export type getLinkedinDraftOutput = InferToolOutput<ReturnType<typeof getLinkedinDraft>>;
export type LinkedinDraftUiTool = InferUITool<ReturnType<typeof getLinkedinDraft>>;
