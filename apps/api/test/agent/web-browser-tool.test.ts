import { buildAgentToolset } from '@repo/ai';
import { afterAll, afterEach, describe, expect, spyOn, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import { stubStreamWriter, stubToolExecutionOptions } from '../stub-stream-writer';

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
  const tools = buildAgentToolset(['webBrowser'], stubStreamWriter, toolContext);
  const execute = tools.webBrowser?.execute;
  if (!execute) {
    throw new Error('webBrowser tool has no execute');
  }
  return execute({ url }, stubToolExecutionOptions);
}

describe('webBrowser tool', () => {
  test('returns the scraped body', async () => {
    respondWith(Response.json({ meta: {}, body: '# Example' }));

    const result = await visit('https://example.com');

    expect(result).toEqual({ meta: null, body: '# Example' });
  });

  test('tells the agent to retry when the browser is busy', async () => {
    respondWith(Response.json({ error: 'busy' }, { status: StatusCodes.SERVICE_UNAVAILABLE }));

    const result = await visit('https://example.com');

    expect(result).toEqual({
      meta: null,
      body: 'the web browser is busy right now. try again shortly.',
    });
  });

  test('reports an unreachable website for other failures', async () => {
    respondWith(Response.json({ error: 'boom' }, { status: StatusCodes.INTERNAL_SERVER_ERROR }));

    const result = await visit('https://example.com');

    expect(result).toEqual({ meta: null, body: 'cannot visit website. does it exist?' });
  });
});
