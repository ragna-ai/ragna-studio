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

export function buildImageUrls({ userId, key }: { userId: string; key: string }): {
  rawUrl: string;
  imgUrl: string;
} {
  return {
    rawUrl: `https://${config.cfImagesBucketName}.${userId}.r2.cloudflarestorage.com/${key}`,
    imgUrl: `https://images.ragna.io/${key}`,
  };
}
