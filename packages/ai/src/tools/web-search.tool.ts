import { config } from '@repo/config';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import type { BaseResponse } from 'serpapi';
import { getJson } from 'serpapi';
import * as z from 'zod';
import type { ToolDefinition, ToolFailure } from './tool-definition';

const webSearchInputSchema = z.object({
  query: z.string().min(3).max(1000).describe('The query to search the web for'),
});

type WebSearchOutput = BaseResponse | ToolFailure<'unavailable'>;

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

export const webSearchToolDefinition: ToolDefinition<typeof webSearchInputSchema, WebSearchOutput> =
  {
    name: 'webSearch',
    description:
      'Use this tool to perform a web search for up-to-date information. Provide relevant keywords or phrases to find the information you need.',
    inputSchema: webSearchInputSchema,
    access: 'read',
    execute: async ({ query }) => {
      const { error, data: searchResults } = await tryCatch(async () => getSearchResults(query), {
        retryOnFailure: false,
      });

      if (error !== null || searchResults === null) {
        logger.warn('Web search failed', error);
        return {
          status: 'unavailable',
          message: 'Web search is currently unavailable. Continue without it.',
        };
      }

      return searchResults;
    },
  };
