import { searchAgentContextDocumentChunks } from '@repo/database';
import { tryCatch } from '@repo/utils';
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
import { embedQuery } from '../services/embedding.service';

const SEARCH_CONTEXT_DOCUMENTS_RESULT_LIMIT = 8;

// Flat top-level z.object, not a union: Anthropic's tool `input_schema`
// requires a top-level `type: "object"` (see memory.tool.ts).
const searchContextDocumentsInputSchema = z.object({
  query: z.string().describe("What to search for in the agent's background documents."),
});

type SearchContextDocumentsInput = z.infer<typeof searchContextDocumentsInputSchema>;
type SearchContextDocumentsResult = {
  documentName: string;
  content: string;
  distance: number;
};
type SearchContextDocumentsOutput = { results: SearchContextDocumentsResult[] } | { error: string };

export const getSearchContextDocumentsTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  agentId: string,
): Tool<SearchContextDocumentsInput, SearchContextDocumentsOutput> =>
  tool({
    description:
      "Search your own background documents (uploaded to you as context) for passages relevant to a query. These are your knowledge base, not the user's workspace documents. Use this whenever the conversation might benefit from something in them.",
    inputSchema: searchContextDocumentsInputSchema,
    execute: async ({ query }) => {
      writer.write({
        type: 'data-search-context-documents',
        data: { query },
        transient: true,
      });

      const { error, data: results } = await tryCatch(
        async () => {
          const queryEmbedding = await embedQuery(query);
          return searchAgentContextDocumentChunks({
            agentId,
            queryEmbedding,
            limit: SEARCH_CONTEXT_DOCUMENTS_RESULT_LIMIT,
          });
        },
        { retryOnFailure: false },
      );

      if (error !== null || !results) {
        return { error: 'Failed to search context documents. Please try again.' };
      }

      return { results };
    },
  });

export type SearchContextDocumentsToolInput = InferToolInput<
  ReturnType<typeof getSearchContextDocumentsTool>
>;
export type SearchContextDocumentsToolOutput = InferToolOutput<
  ReturnType<typeof getSearchContextDocumentsTool>
>;
export type SearchContextDocumentsUiTool = InferUITool<
  ReturnType<typeof getSearchContextDocumentsTool>
>;
