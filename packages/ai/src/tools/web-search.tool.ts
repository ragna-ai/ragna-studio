import { config } from '@repo/config';
import { logger } from '@repo/logger';
import * as z from 'zod';
import type { ToolDefinition, ToolFailure } from './tool-definition';

const SERPAPI_SEARCH_URL = 'https://serpapi.com/search.json';
const SEARCH_TIMEOUT_MS = 30_000;
// SerpAPI's status for a bad parameter; with a location set, that is the location.
const BAD_REQUEST_STATUS = 400;

const webSearchInputSchema = z.object({
  query: z.string().min(3).max(1000).describe('The query to search the web for'),
  location: z
    .string()
    .min(2)
    .max(100)
    .optional()
    .describe(
      'Where the search should originate, as "City, Country" (e.g. "Berlin, Germany"). Leave empty unless results depend on a place.',
    ),
});

type WebSearchInput = z.infer<typeof webSearchInputSchema>;

const organicResultSchema = z.object({
  title: z.string(),
  link: z.string(),
  snippet: z.string().optional(),
  date: z.string().optional(),
});

// SerpAPI omits organic_results when Google found nothing.
const searchResponseSchema = z.object({
  organic_results: z.array(organicResultSchema).optional().default([]),
});

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string | null;
  date: string | null;
}

interface WebSearchResults {
  results: WebSearchResult[];
}

type WebSearchOutput = WebSearchResults | ToolFailure<'invalid_location' | 'unavailable'>;

const unavailable: ToolFailure<'unavailable'> = {
  status: 'unavailable',
  message: 'Web search is currently unavailable. Continue without it.',
};

function toSearchUrl({ query, location }: WebSearchInput): string {
  const searchParams = new URLSearchParams({
    engine: 'google',
    api_key: config.getSecret('SERP_API_KEY'),
    q: query,
  });
  if (location) {
    searchParams.set('location', location);
  }
  return `${SERPAPI_SEARCH_URL}?${searchParams.toString()}`;
}

async function search(input: WebSearchInput): Promise<WebSearchOutput> {
  const response = await fetch(toSearchUrl(input), {
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });

  if (response.status === BAD_REQUEST_STATUS && input.location) {
    return {
      status: 'invalid_location',
      message: 'The location is not supported. Use "City, Country" or search without a location.',
    };
  }

  if (!response.ok) {
    logger.warn('Web search returned an error status', response.status);
    return unavailable;
  }

  const body: unknown = await response.json();
  const parsed = searchResponseSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn('Web search returned an unexpected body', parsed.error.issues);
    return unavailable;
  }

  const results = parsed.data.organic_results.map((result) => ({
    title: result.title,
    url: result.link,
    snippet: result.snippet ?? null,
    date: result.date ?? null,
  }));
  return { results };
}

export const webSearchToolDefinition: ToolDefinition<typeof webSearchInputSchema, WebSearchOutput> =
  {
    name: 'webSearch',
    description:
      'Use this tool to perform a web search for up-to-date information. Provide relevant keywords or phrases to find the information you need. Returns the title, URL, snippet and date of each result.',
    inputSchema: webSearchInputSchema,
    access: 'read',
    execute: async (input) => {
      try {
        return await search(input);
      } catch (error) {
        logger.warn('Web search failed', error);
        return unavailable;
      }
    },
  };
