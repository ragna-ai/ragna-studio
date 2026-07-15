// Single source of truth for the R2 bucket/prefix and public URLs used by
// generated images. Anything that writes or reads a gen-image object (the
// AI package's create pipeline, the API's list endpoint) must build its
// key/URL through these helpers instead of re-deriving the strings.

const IMAGE_GEN_BUCKET_NAME = 'ragna-cloud-images';

export function getImgGenBucketNameForUser(userId: string): {
  bucketName: string;
  prefix: string;
} {
  return {
    bucketName: IMAGE_GEN_BUCKET_NAME,
    prefix: `${userId}/images/generated`,
  };
}

export function buildImageUrls({
  userId,
  key,
}: {
  userId: string;
  key: string;
}): { rawUrl: string; imgUrl: string } {
  return {
    rawUrl: `https://ragna-cloud-images.${userId}.r2.cloudflarestorage.com/${key}`,
    imgUrl: `https://images.ragna.app/${key}`,
  };
}
