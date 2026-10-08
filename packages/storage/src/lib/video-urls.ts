import { config } from '@repo/config';

// Same bucket as generated images, new prefix. Serves mp4s from the
// existing public domain instead of a dedicated video bucket.
export function getVideoGenBucketNameForUser(userId: string): {
  bucketName: string;
  prefix: string;
} {
  return {
    bucketName: config.s3ImagesBucketName,
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
    bucketName: config.s3ImagesBucketName,
    prefix: `${userId}/videos/frames`,
  };
}

// Persisted BFL draft bundles (specs/videogen/prd-v2.md decision 3). No
// public URL helper: the encrypted .bin is never served to the browser, the
// worker is the only reader (it downloads its own upload for the enhance
// path).
export function getVideoDraftBucketNameForUser(userId: string): {
  bucketName: string;
  prefix: string;
} {
  return {
    bucketName: config.s3ImagesBucketName,
    prefix: `${userId}/videos/drafts`,
  };
}
