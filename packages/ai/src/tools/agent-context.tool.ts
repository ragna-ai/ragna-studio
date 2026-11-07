import { searchAgentContextDocumentChunks } from '@repo/database';
import * as z from 'zod';
import { embedQuery } from '../services/embedding.service';
import type { ToolDefinition } from './tool-definition';

const SEARCH_CONTEXT_DOCUMENTS_RESULT_LIMIT = 8;

// Flat top-level z.object, not a union: Anthropic's tool `input_schema`
// requires a top-level `type: "object"` (see memory.tool.ts).
const searchContextDocumentsInputSchema = z.object({
  query: z.string().describe("What to search for in the agent's background documents."),
});

interface SearchContextDocumentsResult {
  documentName: string;
  content: string;
  distance: number;
}

interface SearchContextDocumentsOutput {
  results: SearchContextDocumentsResult[];
}

export interface SearchContextDocumentsToolOptions {
  agentId: string;
}

export const searchContextDocumentsToolDefinition = ({
  agentId,
}: SearchContextDocumentsToolOptions): ToolDefinition<
  typeof searchContextDocumentsInputSchema,
  SearchContextDocumentsOutput
> => ({
  name: 'searchContextDocuments',
  description:
    "Search your own background documents (uploaded to you as context) for passages relevant to a query. These are your knowledge base, not the user's workspace documents. Use this whenever the conversation might benefit from something in them.",
  inputSchema: searchContextDocumentsInputSchema,
  access: 'read',
  execute: async ({ query }) => {
    const queryEmbedding = await embedQuery(query);
    const results = await searchAgentContextDocumentChunks({
      agentId,
      queryEmbedding,
      limit: SEARCH_CONTEXT_DOCUMENTS_RESULT_LIMIT,
    });
    return { results };
  },
});
