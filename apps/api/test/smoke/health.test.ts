import { describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import { app } from '../../src/app';

describe('GET /health', () => {
  test('returns 200 with the ok status', async () => {
    const response = await app.request('/health');

    expect(response.status).toBe(StatusCodes.OK);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
