import { describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import { app } from '../../src/app';

// A controller's path-less middleware must stay inside its own base path.
// If one leaks, unknown routes answer with that middleware's error instead
// of 404 and hide missing routes.
describe('unknown routes', () => {
  test('return 404 without an origin header', async () => {
    const response = await app.request('/does-not-exist');

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});
