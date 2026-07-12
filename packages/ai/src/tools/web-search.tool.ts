import { config } from '@repo/config';
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
import type { BaseResponse } from 'serpapi';
import { getJson } from 'serpapi';
import * as z from 'zod';

const webSearchInputSchema = z.object({
  query: z.string().min(3).max(1000).describe('The query to search the web for'),
});

type WebSearchInput = z.infer<typeof webSearchInputSchema>;
type WebSearchOutput = BaseResponse | { error: string };

async function getSearchResults(query: string): Promise<BaseResponse> {
  const response = await getJson({
    engine: 'google',
    api_key: config.getSecret('SERP_API_KEY'),
    q: query,
    location: 'Berlin,Berlin,Germany',
  });

  // remove unnecessary properties
  delete response.search_metadata;
  delete response.search_parameters;
  delete response.related_searches;
  delete response.related_questions;
  delete response.pagination;
  delete response.serpapi_pagination;

  return response;
}

export const getWebSearchResults = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
): Tool<WebSearchInput, WebSearchOutput> =>
  tool({
    description:
      'Use this tool to perform a web search for up-to-date information. Provide relevant keywords or phrases to find the information you need.',
    inputSchema: webSearchInputSchema,
    execute: async ({ query }) => {
      // emit tool usage message
      writer.write({
        type: 'data-webSearch',
        data: { query },
        transient: true,
      });

      const { error, data: responseObject } = await tryCatch(async () => getSearchResults(query), {
        retryOnFailure: false,
      });

      if (error !== null || responseObject === null) {
        return { error: 'Web search failed. Service currently unavailable.' };
      }

      return responseObject;
    },
  });

export type getWebSearchResultsInput = InferToolInput<ReturnType<typeof getWebSearchResults>>;
export type getWebSearchResultsOutput = InferToolOutput<ReturnType<typeof getWebSearchResults>>;
export type WebSearchUiTool = InferUITool<ReturnType<typeof getWebSearchResults>>;
