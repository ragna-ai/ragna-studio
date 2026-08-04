import { createS3Client } from '../lib/s3-client';

export interface R2Object {
  key: string;
  lastModified?: Date;
  size?: number;
}

export interface ObjectStat {
  exists: boolean;
  // Byte size, or 0 when the object doesn't exist.
  size: number;
}

// HEAD-only lookup: existence plus byte size, without downloading the
// object. Used by one-off backfill/maintenance scripts (e.g.
// apps/api/scripts/backfill-media.ts) that need to size an already-uploaded
// object for a new media row.
export async function getObjectStat(bucketName: string, key: string): Promise<ObjectStat> {
  if (!bucketName) throw new Error('Bucket name is required');
  if (!key) throw new Error('Object key is required');

  const s3 = createS3Client(bucketName);
  const exists = await s3.objectExists(key);

  if (exists === false) {
    return { exists: false, size: 0 };
  }

  const size = await s3.getContentLength(key);
  return { exists: true, size };
}

export async function listObjects(bucketName: string, prefix = '', cursor?: string) {
  if (!bucketName) throw new Error('Bucket name is required');

  try {
    const s3 = createS3Client(bucketName);
    const result = await s3.listObjectsPaged(undefined, prefix, 50, cursor);

    const objects: R2Object[] = (result?.objects ?? []).map((item) => ({
      key: item.Key,
      lastModified: item.LastModified,
      size: item.Size,
    }));

    return {
      objects,
      nextCursor: result?.nextContinuationToken,
      isTruncated: !!result?.nextContinuationToken,
    };
  } catch (error) {
    console.error('Error listing objects:', error);
    throw new Error('Failed to list objects');
  }
}

export async function deleteObjects(bucketName: string, keys: string[]) {
  if (!bucketName) throw new Error('Bucket name is required');
  if (keys.length === 0) return { deleted: [] as string[], errors: [] as string[] };

  try {
    const s3 = createS3Client(bucketName);
    const results = await s3.deleteObjects(keys);

    const deleted: string[] = [];
    const errors: string[] = [];
    results.forEach((success, i) => {
      if (success) deleted.push(keys[i]);
      else errors.push(keys[i]);
    });

    return { deleted, errors };
  } catch (error) {
    console.error('Error deleting objects:', error);
    throw new Error('Failed to delete objects');
  }
}

export async function deleteAllObjects(bucketName: string) {
  if (!bucketName) throw new Error('Bucket name is required');

  let deletedCount = 0;
  let nextContinuationToken: string | undefined;
  const s3 = createS3Client(bucketName);

  try {
    do {
      const result = await s3.listObjectsPaged(undefined, '', 1000, nextContinuationToken);
      const objects = result?.objects;

      if (!objects || objects.length === 0) break;

      await s3.deleteObjects(objects.map((o) => o.Key));
      deletedCount += objects.length;

      nextContinuationToken = result?.nextContinuationToken;
    } while (nextContinuationToken);

    return { success: true, count: deletedCount };
  } catch (error) {
    console.error('Error deleting all objects:', error);
    throw new Error('Failed to delete all objects');
  }
}

export async function uploadObject({
  bucketName,
  formData,
  prefix,
  relativePath,
}: {
  bucketName: string;
  formData: FormData;
  prefix: string;
  relativePath?: string;
}) {
  if (!bucketName) throw new Error('Bucket name is required');

  const file = formData.get('file') as File;
  if (!file) throw new Error('File is required');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let key: string;
    if (relativePath) {
      key = prefix ? `${prefix}${relativePath}` : relativePath;
    } else {
      key = prefix ? `${prefix}${file.name}` : file.name;
    }

    const s3 = createS3Client(bucketName);
    await s3.putObject(key, buffer, file.type);
    return { success: true, key };
  } catch (error) {
    console.error('Error uploading object:', error);
    throw new Error('Failed to upload object');
  }
}

export async function uploadObjectBuffer({
  bucketName,
  buffer,
  key,
  contentType,
}: {
  bucketName: string;
  buffer: Buffer | Uint8Array;
  key: string;
  contentType: string;
}) {
  if (!bucketName) throw new Error('Bucket name is required');

  try {
    const s3 = createS3Client(bucketName);
    await s3.putObject(key, buffer, contentType);
    return { success: true, key };
  } catch (error) {
    console.error('Error uploading object buffer:', error);
    throw new Error('Failed to upload object buffer');
  }
}

export async function downloadObject(bucketName: string, key: string) {
  if (!bucketName) throw new Error('Bucket name is required');
  if (!key) throw new Error('Object key is required');

  try {
    const s3 = createS3Client(bucketName);
    const response = await s3.getObjectResponse(key);

    if (!response) throw new Error('Object not found');

    const arrayBuffer = await response.arrayBuffer();
    const contentLength = response.headers.get('content-length');

    return {
      data: Buffer.from(arrayBuffer).toString('base64'),
      contentType: response.headers.get('content-type') || 'application/octet-stream',
      contentLength: contentLength ? Number(contentLength) : undefined,
    };
  } catch (error) {
    console.error('Error downloading object:', error);
    throw new Error('Failed to download object');
  }
}

// Same as downloadObject, but returns the raw bytes instead of a base64
// string. Base64 doubles the payload size in memory, which is wasted work
// for callers that just re-upload the bytes elsewhere (e.g. LinkedIn media
// publishing) instead of putting them in a JSON response.
export async function downloadObjectBuffer(bucketName: string, key: string) {
  if (!bucketName) throw new Error('Bucket name is required');
  if (!key) throw new Error('Object key is required');

  try {
    const s3 = createS3Client(bucketName);
    const response = await s3.getObjectResponse(key);

    if (!response) throw new Error('Object not found');

    const arrayBuffer = await response.arrayBuffer();

    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: response.headers.get('content-type') || 'application/octet-stream',
    };
  } catch (error) {
    console.error('Error downloading object buffer:', error);
    throw new Error('Failed to download object buffer');
  }
}
