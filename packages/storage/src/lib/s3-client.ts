import { config } from '@repo/config';
import S3mini from 's3mini';

/**
 * Creates an S3 client for the given bucket reference.
 *
 * @param bucketName The name of the bucket to create the client for.
 * @returns An S3mini client configured for the specified bucket.
 */
export function createS3Client(bucketName: string): S3mini {
  const jurisdictionHostSegment = config.cfRegion !== 'auto' ? `${config.cfRegion}.` : '';

  return new S3mini({
    region: 'auto',
    endpoint: `https://${config.cfAccountId}.${jurisdictionHostSegment}r2.cloudflarestorage.com/${bucketName}`,
    accessKeyId: config.cfAccessKeyId || '',
    secretAccessKey: config.getSecret('CF_SECRET_ACCESS_KEY') || '',
  });
}
