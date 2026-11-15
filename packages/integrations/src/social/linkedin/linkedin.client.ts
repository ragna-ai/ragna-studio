import {
  createVendorClient,
  LINKEDIN_API,
  LINKEDIN_API_VERSION,
  VendorApiError,
  type VendorClient,
} from '../../http';
import { LinkedinPublishError } from '../errors';
import type { LinkedinPublisherOptions } from './linkedin.publisher';

export type LinkedinClientOptions = Pick<LinkedinPublisherOptions, 'getAccessToken' | 'sleep'>;

export function createLinkedinClient(options: LinkedinClientOptions): VendorClient {
  return createVendorClient(LINKEDIN_API, {
    getAccessToken: options.getAccessToken,
    sleep: options.sleep,
    headers: {
      'LinkedIn-Version': LINKEDIN_API_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });
}

function toLinkedinPublishError(error: VendorApiError): LinkedinPublishError {
  if (error.status === 401) return new LinkedinPublishError('auth', error.message);
  if (error.kind === 'rate_limited') return new LinkedinPublishError('rate_limited', error.message);
  return new LinkedinPublishError('rejected', error.message);
}

/** Maps what the shared client throws after its retries into the publisher's error. */
export async function withLinkedinErrors<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof VendorApiError) throw toLinkedinPublishError(error);
    throw error;
  }
}
