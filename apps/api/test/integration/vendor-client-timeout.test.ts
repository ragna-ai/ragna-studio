import { createVendorClient, LINKEDIN_API } from '@repo/integrations/http';
import { LINKEDIN_ENDPOINTS, resetProviderMocks, vendorRequestsTo } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';

const client = createVendorClient(LINKEDIN_API, {
  getAccessToken: () => Promise.resolve('test-access-token'),
});

beforeEach(() => {
  resetProviderMocks();
});

describe('the vendor client request timeout', () => {
  test('accepts a positive integer and sends the request', async () => {
    const response = await client.requestRaw('images/abc', {
      method: 'GET',
      authorize: true,
      timeoutMs: 120_000,
    });

    expect(response.ok).toBe(true);
    expect(vendorRequestsTo(LINKEDIN_ENDPOINTS.imageStatus)).toHaveLength(1);
  });

  test.each([0, -5, 1.5, Number.NaN])('rejects %p before sending anything', async (timeoutMs) => {
    const call = client.requestRaw('images/abc', { method: 'GET', authorize: true, timeoutMs });

    await expect(call).rejects.toThrow(RangeError);
    expect(vendorRequestsTo(LINKEDIN_ENDPOINTS.imageStatus)).toHaveLength(0);
  });
});
