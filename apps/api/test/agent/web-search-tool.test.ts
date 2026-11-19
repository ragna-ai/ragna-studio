import { buildAgentToolset } from '@repo/ai';
import { afterAll, afterEach, describe, expect, spyOn, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { stubToolExecutionOptions } from '../stub-tool-execution-options';

// SerpAPI is external to the API, so its HTTP responses are faked at `fetch`.

const fetchSpy = spyOn(globalThis, 'fetch');

afterEach(() => {
  fetchSpy.mockReset();
});

afterAll(() => {
  fetchSpy.mockRestore();
});

function respondWith(response: Response) {
  fetchSpy.mockResolvedValue(response);
}

function requestedUrl(): URL {
  const [input] = fetchSpy.mock.calls[0] ?? [];
  if (typeof input !== 'string') {
    throw new Error('expected fetch to be called with a URL string');
  }
  return new URL(input);
}

interface SearchInput {
  query: string;
  location?: string;
}

async function search(input: SearchInput) {
  const toolContext = { userId: 'user-1', agentId: 'agent-1', workspaceId: 'workspace-1' };
  const tools = buildAgentToolset([{ id: 'webSearch' }], toolContext);
  const execute = tools.webSearch?.execute;
  if (!execute) {
    throw new Error('webSearch tool has no execute');
  }
  return execute(input, stubToolExecutionOptions);
}

const failureSchema = z.strictObject({ status: z.string(), message: z.string() });
const resultsSchema = z.strictObject({
  answer: z.string().nullable(),
  results: z.array(
    z.strictObject({
      title: z.string(),
      url: z.string(),
      snippet: z.string().nullable(),
      date: z.string().nullable(),
    }),
  ),
});

const SERPAPI_RESPONSE = {
  search_metadata: { id: 'search-1', status: 'Success' },
  search_parameters: { engine: 'google', q: 'ragna studio' },
  search_information: { total_results: 2 },
  related_questions: [{ question: 'What is RAGNA?' }],
  organic_results: [
    {
      position: 1,
      title: 'RAGNA Studio',
      link: 'https://ragna.io',
      snippet: 'AI workspace for teams.',
      date: 'Nov 1, 2026',
      favicon: 'https://ragna.io/favicon.ico',
      sitelinks: { inline: [{ title: 'Docs', link: 'https://docs.ragna.io' }] },
    },
    { position: 2, title: 'RAGNA docs', link: 'https://docs.ragna.io' },
  ],
};

describe('webSearch tool', () => {
  test('returns title, url, snippet and date for each result', async () => {
    respondWith(Response.json(SERPAPI_RESPONSE));

    const result = resultsSchema.parse(await search({ query: 'ragna studio' }));

    expect(result.results).toEqual([
      {
        title: 'RAGNA Studio',
        url: 'https://ragna.io',
        snippet: 'AI workspace for teams.',
        date: 'Nov 1, 2026',
      },
      { title: 'RAGNA docs', url: 'https://docs.ragna.io', snippet: null, date: null },
    ]);
  });

  test('returns an empty list when the search has no results', async () => {
    respondWith(
      Response.json({
        search_metadata: { id: 'search-2', status: 'Success' },
        error: "Google hasn't returned any results for this query.",
      }),
    );

    const result = resultsSchema.parse(await search({ query: 'no hits anywhere' }));

    expect(result.results).toEqual([]);
  });

  test.each([
    [
      'a direct answer',
      { answer_box: { answer: '3.9 million', snippet: 'Berlin has…' } },
      '3.9 million',
    ],
    ['a calculator result', { answer_box: { result: '42' } }, '42'],
    [
      'an answer box snippet',
      { answer_box: { snippet: 'Berlin is the capital.' } },
      'Berlin is the capital.',
    ],
    [
      'a knowledge graph description',
      { knowledge_graph: { description: 'Capital of Germany.' } },
      'Capital of Germany.',
    ],
  ])('returns the answer from %s', async (_label, block, expected) => {
    respondWith(Response.json({ ...SERPAPI_RESPONSE, ...block }));

    const result = resultsSchema.parse(await search({ query: 'population of berlin' }));

    expect(result.answer).toBe(expected);
  });

  test('prefers the answer box over the knowledge graph', async () => {
    respondWith(
      Response.json({
        ...SERPAPI_RESPONSE,
        answer_box: { answer: '3.9 million' },
        knowledge_graph: { description: 'Capital of Germany.' },
      }),
    );

    const result = resultsSchema.parse(await search({ query: 'population of berlin' }));

    expect(result.answer).toBe('3.9 million');
  });

  test('returns no answer when Google shows none', async () => {
    respondWith(Response.json(SERPAPI_RESPONSE));

    const result = resultsSchema.parse(await search({ query: 'ragna studio' }));

    expect(result.answer).toBeNull();
  });

  test('sends no location unless the agent asks for one', async () => {
    respondWith(Response.json(SERPAPI_RESPONSE));

    await search({ query: 'ragna studio' });

    expect(requestedUrl().searchParams.has('location')).toBe(false);
  });

  test('searches from the location the agent asks for', async () => {
    respondWith(Response.json(SERPAPI_RESPONSE));

    await search({ query: 'coffee', location: 'Berlin, Germany' });

    expect(requestedUrl().searchParams.get('location')).toBe('Berlin, Germany');
  });

  test('reports an invalid location when SerpAPI rejects the location', async () => {
    respondWith(
      Response.json(
        { error: 'Unsupported `Nowhere` location - location parameter.' },
        { status: StatusCodes.BAD_REQUEST },
      ),
    );

    const result = failureSchema.parse(await search({ query: 'coffee', location: 'Nowhere' }));

    expect(result.status).toBe('invalid_location');
  });

  test('reports the search as unavailable when SerpAPI fails', async () => {
    respondWith(Response.json({ error: 'Invalid API key.' }, { status: StatusCodes.UNAUTHORIZED }));

    const result = failureSchema.parse(await search({ query: 'ragna studio' }));

    expect(result.status).toBe('unavailable');
  });

  test('reports the search as unavailable when SerpAPI cannot be reached', async () => {
    fetchSpy.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.9:443'));

    const result = failureSchema.parse(await search({ query: 'ragna studio' }));

    expect(result.status).toBe('unavailable');
    expect(result.message).not.toContain('ECONNREFUSED');
  });
});
