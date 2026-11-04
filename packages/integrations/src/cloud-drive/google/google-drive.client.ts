import { createVendorClient, googleApi, VendorApiError, type VendorClient } from '../../http';
import { CloudDriveError } from '../errors';
import type { CloudDriveProviderOptions } from '../cloud-drive.types';

const GOOGLE_DRIVE_API = googleApi({
  name: 'Google Drive',
  baseUrl: 'https://www.googleapis.com/drive/v3',
});

const RATE_LIMIT_REASONS = [
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'sharingRateLimitExceeded',
];
const READ_ONLY_REASONS = ['appNotAuthorizedToFile', 'insufficientFilePermissions'];
const TOO_LARGE_REASONS = ['exportSizeLimitExceeded'];

export function createGoogleDriveClient(options: CloudDriveProviderOptions): VendorClient {
  return createVendorClient(GOOGLE_DRIVE_API, {
    getAccessToken: options.getAccessToken,
    sleep: options.sleep,
  });
}

function toCloudDriveError(error: VendorApiError): CloudDriveError | null {
  const message = error.message;
  const code = error.code ?? '';
  if (error.status === 404 || error.status === 410)
    return new CloudDriveError('not_found', message);
  if (error.status === 429) return new CloudDriveError('rate_limited', message);
  if (error.status === 401) return new CloudDriveError('auth', message);
  if (error.status !== 403) return null;
  if (RATE_LIMIT_REASONS.includes(code)) return new CloudDriveError('rate_limited', message);
  if (READ_ONLY_REASONS.includes(code)) return new CloudDriveError('read_only', message);
  if (TOO_LARGE_REASONS.includes(code)) return new CloudDriveError('too_large', message);
  return new CloudDriveError('auth', message);
}

/** Maps what the shared client throws after its retries into the capability's error. */
export async function withDriveErrors<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof VendorApiError) throw toCloudDriveError(error) ?? error;
    throw error;
  }
}
