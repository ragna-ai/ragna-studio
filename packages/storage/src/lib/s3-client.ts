import S3mini from 's3mini';
import { config } from '@repo/config';

export function createS3Client(bucketName: string): S3mini {
  return new S3mini({
    region: 'auto',
    endpoint: `https://${config.cfAccountId}.r2.cloudflarestorage.com/${bucketName}`,
    accessKeyId: config.cfAccessKeyId || '',
    secretAccessKey: config.getSecret('CF_SECRET_ACCESS_KEY') || '',
  });
}
