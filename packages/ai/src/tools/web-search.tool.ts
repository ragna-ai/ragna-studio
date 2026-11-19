import { config } from '@repo/config';
import { logger } from '@repo/logger';
import * as z from 'zod';
import type { ToolDefinition, ToolFailure, ToolOutput } from './tool-definition';

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

// Google's direct answer, e.g. a fact, a calculation or a definition.
const answerBoxSchema = z.object({
  answer: z.string().optional(),
  result: z.string().optional(),
  snippet: z.string().optional(),
});

const knowledgeGraphSchema = z.object({ description: z.string().optional() });

// SerpAPI omits organic_results when Google found nothing.
const searchResponseSchema = z.object({
  answer_box: answerBoxSchema.optional(),
  knowledge_graph: knowledgeGraphSchema.optional(),
  organic_results: z.array(organicResultSchema).optional().default([]),
});

type SearchResponse = z.infer<typeof searchResponseSchema>;

const webSearchResultSchema = z.strictObject({
  title: z.string(),
  url: z.string(),
  snippet: z.string().nullable(),
  date: z.string().nullable(),
});

/** What a successful web search returns to the model. */
export const webSearchOutputSchema = z.strictObject({
  /** Google's direct answer when it shows one, so the model needn't open a page for a simple fact. */
  answer: z.string().nullable(),
  results: z.array(webSearchResultSchema),
});

export type WebSearchResults = z.infer<typeof webSearchOutputSchema>;

type WebSearchFailureStatus = 'invalid_location' | 'unavailable';
type WebSearchOutput = ToolOutput<typeof webSearchOutputSchema, WebSearchFailureStatus>;

const unavailable: ToolFailure<'unavailable'> = {
  status: 'unavailable',
  message: 'Web search is currently unavailable. Continue without it.',
};

function toAnswer({ answer_box: answerBox, knowledge_graph: knowledgeGraph }: SearchResponse) {
  return (
    answerBox?.answer ??
    answerBox?.result ??
    answerBox?.snippet ??
    knowledgeGraph?.description ??
    null
  );
}

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
  return { answer: toAnswer(parsed.data), results };
}

export const webSearchToolDefinition: ToolDefinition<
  typeof webSearchInputSchema,
  typeof webSearchOutputSchema,
  WebSearchFailureStatus
> = {
  name: 'webSearch',
  description:
    'Use this tool to perform a web search for up-to-date information. Provide relevant keywords or phrases to find the information you need. Returns the direct answer Google shows, if any, and the title, URL, snippet and date of each result.',
  inputSchema: webSearchInputSchema,
  outputSchema: webSearchOutputSchema,
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
