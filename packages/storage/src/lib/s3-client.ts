import { config } from '@repo/config';
import S3mini from 's3mini';

/**
 * Creates an S3 client for the given bucket reference.
 *
 * @param bucketName The name of the bucket to create the client for.
 * @returns An S3mini client configured for the specified bucket.
 */
export function createS3Client(bucketName: string): S3mini {
  return new S3mini({
    endpoint: `${config.s3Endpoint}/${bucketName}`,
    region: config.s3Region,
    accessKeyId: config.s3AccessKeyId,
    secretAccessKey: config.getSecret('S3_SECRET_ACCESS_KEY') || '',
  });
}
