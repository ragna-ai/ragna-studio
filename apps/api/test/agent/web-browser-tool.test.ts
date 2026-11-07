import { buildAgentToolset } from '@repo/ai';
import { afterAll, afterEach, describe, expect, spyOn, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { stubToolExecutionOptions } from '../stub-tool-execution-options';

// The webbrowser service is external to the API, so its HTTP responses are faked at `fetch`.

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

async function visit(url: string) {
  const toolContext = { userId: 'user-1', agentId: 'agent-1', workspaceId: 'workspace-1' };
  const tools = buildAgentToolset([{ id: 'webBrowser' }], toolContext);
  const execute = tools.webBrowser?.execute;
  if (!execute) {
    throw new Error('webBrowser tool has no execute');
  }
  return execute({ url }, stubToolExecutionOptions);
}

const failureSchema = z.strictObject({ status: z.string(), message: z.string() });
const pageSchema = z.strictObject({ meta: z.null(), body: z.string() });

describe('webBrowser tool', () => {
  test('returns the scraped body', async () => {
    respondWith(Response.json({ meta: {}, body: '# Example' }));

    const result = pageSchema.parse(await visit('https://example.com'));

    expect(result).toEqual({ meta: null, body: '# Example' });
  });

  test('tells the agent to retry when the browser is busy', async () => {
    respondWith(Response.json({ error: 'busy' }, { status: StatusCodes.SERVICE_UNAVAILABLE }));

    const result = failureSchema.parse(await visit('https://example.com'));

    expect(result.status).toBe('busy');
  });

  test('reports an unreachable website for other failures', async () => {
    respondWith(Response.json({ error: 'boom' }, { status: StatusCodes.INTERNAL_SERVER_ERROR }));

    const result = failureSchema.parse(await visit('https://example.com'));

    expect(result.status).toBe('unreachable');
  });

  test('reports an unreachable website when the service cannot be reached', async () => {
    fetchSpy.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:3011'));

    const result = failureSchema.parse(await visit('https://example.com'));

    expect(result.status).toBe('unreachable');
    expect(result.message).not.toContain('ECONNREFUSED');
  });

  test('reports an unreachable website when the service answers with an unexpected body', async () => {
    respondWith(Response.json({ meta: {} }));

    const result = failureSchema.parse(await visit('https://example.com'));

    expect(result.status).toBe('unreachable');
  });

  test('returns an invalid url failure for a non-https url', async () => {
    const result = failureSchema.parse(await visit('http://example.com'));

    expect(result.status).toBe('invalid_url');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
