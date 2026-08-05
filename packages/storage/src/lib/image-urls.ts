import { config } from '@repo/config';

export function getImgGenBucketNameForUser(userId: string): {
  bucketName: string;
  prefix: string;
} {
  return {
    bucketName: config.cfImagesBucketName,
    prefix: `${userId}/images/generated`,
  };
}

export function getImgRefBucketNameForUser(userId: string): {
  bucketName: string;
  prefix: string;
} {
  return {
    bucketName: config.cfImagesBucketName,
    prefix: `${userId}/images/references`,
  };
}

/**
 * The single source of truth for the public CDN URL of an object in the
 * images bucket (images and mp4s alike). Never hand-roll this domain at a
 * call site: a retyped domain 404s silently (a `.app`-for-`.io` typo in
 * social-post.service.ts broke all social post images once).
 */
export function getPublicMediaUrl(key: string): string {
  return `https://images.ragna.io/${key}`;
}

export function buildImageUrls({ userId, key }: { userId: string; key: string }): {
  rawUrl: string;
  imgUrl: string;
} {
  return {
    rawUrl: `https://${config.cfImagesBucketName}.${userId}.r2.cloudflarestorage.com/${key}`,
    imgUrl: getPublicMediaUrl(key),
  };
}
