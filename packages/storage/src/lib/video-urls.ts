import { config } from '@repo/config';

// Same bucket as generated images, new prefix. Serves mp4s from the
// existing public domain instead of a dedicated video bucket.
export function getVideoGenBucketNameForUser(userId: string): {
  bucketName: string;
  prefix: string;
} {
  return {
    bucketName: config.cfImagesBucketName,
    prefix: `${userId}/videos/generated`,
  };
}

// First-frame uploads (as opposed to a gen_images frame, which reuses that
// image's own storage key and never lands under this prefix).
export function getVideoFrameBucketNameForUser(userId: string): {
  bucketName: string;
  prefix: string;
} {
  return {
    bucketName: config.cfImagesBucketName,
    prefix: `${userId}/videos/frames`,
  };
}

export function buildVideoUrls({ userId, key }: { userId: string; key: string }): {
  rawUrl: string;
  videoUrl: string;
} {
  return {
    rawUrl: `https://${config.cfImagesBucketName}.${userId}.r2.cloudflarestorage.com/${key}`,
    videoUrl: `https://images.ragna.io/${key}`,
  };
}
