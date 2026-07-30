import { describe, expect, test } from 'bun:test';
import { app } from '../../src/app';

describe('GET /health', () => {
  test('returns 200 with the ok status', async () => {
    const response = await app.request('/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
