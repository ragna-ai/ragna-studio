// packages/media/src/lib/media-keys.ts
//
// Media-scoped storage placement (docs/media-library/prd.md decision 3,
// layering rule from docs/media-library/unified-media-prd.md decision 1:
// only @repo/media knows which bucket a kind belongs in). No chatId in any
// key: deletion is row-driven (media.service.ts), and a library file isn't
// owned by one chat. `ownerId` is whichever owner FK is set on the media
// row (a workspace id in v1).

import { config } from '@repo/config';
import { toPublicMediaUrl } from '@repo/storage';
import { IMAGE_KINDS, type MediaKind } from '../types';

// Chat-uploaded images land in the public images bucket, so the existing
// CDN convention (toPublicMediaUrl) can render and fetch
// them.
export function getChatUploadImageKey({
  ownerId,
  mediaId,
}: {
  ownerId: string;
  mediaId: string;
}): string {
  return `${ownerId}/images/chat-uploads/${mediaId}`;
}

export function toChatUploadImageUrl({
  ownerId,
  mediaId,
}: {
  ownerId: string;
  mediaId: string;
}): string {
  return toPublicMediaUrl(getChatUploadImageKey({ ownerId, mediaId }));
}

// Everything else (pdf, docx, pptx, xlsx, csv, txt, md) goes to the private
// documents bucket. No public URL: consumers stream it through their own
// authenticated download route.
export function getMediaDocumentKey({
  ownerId,
  mediaId,
}: {
  ownerId: string;
  mediaId: string;
}): string {
  return `${ownerId}/media/${mediaId}`;
}

export interface MediaStoragePlacement {
  bucket: string;
  storageKey: string;
}

// The one place that decides which bucket a kind belongs in
// (unified-media-prd.md decision 1). Used by media.service.ts's
// `storeMedia`.
export function resolveMediaStoragePlacement({
  ownerId,
  mediaId,
  kind,
}: {
  ownerId: string;
  mediaId: string;
  kind: MediaKind;
}): MediaStoragePlacement {
  if (IMAGE_KINDS.includes(kind)) {
    return {
      bucket: config.s3ImagesBucketName,
      storageKey: getChatUploadImageKey({ ownerId, mediaId }),
    };
  }

  return {
    bucket: config.s3DocumentsBucketName,
    storageKey: getMediaDocumentKey({ ownerId, mediaId }),
  };
}
