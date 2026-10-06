import { config } from '@repo/config';

export function getImgGenBucketNameForUser(userId: string): {
  bucketName: string;
  prefix: string;
} {
  return {
    bucketName: config.s3ImagesBucketName,
    prefix: `${userId}/images/generated`,
  };
}

/**
 * The single source of truth for the public CDN URL of an object in the
 * images bucket (images and mp4s alike). Never hand-roll this domain at a
 * call site: a retyped domain 404s silently (a `.app`-for-`.io` typo in
 * social-post.service.ts broke all social post images once).
 */
export function toPublicMediaUrl(key: string): string {
  return `${config.mediaUrl}/${key}`;
}
