import { config } from '@repo/config';
import { getPublicMediaUrl } from './image-urls';

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

// Persisted BFL draft bundles (docs/videogen/prd-v2.md decision 3). No
// public URL helper: the encrypted .bin is never served to the browser, the
// worker is the only reader (it downloads its own upload for the enhance
// path).
export function getVideoDraftBucketNameForUser(userId: string): {
  bucketName: string;
  prefix: string;
} {
  return {
    bucketName: config.cfImagesBucketName,
    prefix: `${userId}/videos/drafts`,
  };
}

export function buildVideoUrls({ userId, key }: { userId: string; key: string }): {
  rawUrl: string;
  videoUrl: string;
} {
  return {
    rawUrl: `https://${config.cfImagesBucketName}.${userId}.r2.cloudflarestorage.com/${key}`,
    videoUrl: getPublicMediaUrl(key),
  };
}
