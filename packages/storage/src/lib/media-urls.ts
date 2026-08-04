import { buildImageUrls } from './image-urls';

// Media-scoped keys (docs/media-library/prd.md, decision 3): no chatId in the
// path, since deletion is row-driven and a library file isn't owned by one
// chat. `ownerId` is whichever owner FK is set on the media row (a
// workspace id in v1).

// Chat-uploaded images land in the public images bucket, so the existing
// CDN convention (buildImageUrls, images.ragna.io) can render and fetch them.
export function getChatUploadImageKey({ ownerId, mediaId }: { ownerId: string; mediaId: string }): string {
  return `${ownerId}/images/chat-uploads/${mediaId}`;
}

export function buildChatUploadImageUrls({
  ownerId,
  mediaId,
}: {
  ownerId: string;
  mediaId: string;
}): { rawUrl: string; imgUrl: string } {
  return buildImageUrls({ userId: ownerId, key: getChatUploadImageKey({ ownerId, mediaId }) });
}

// Everything else (pdf, docx, xlsx, txt, md, csv) goes to the private
// documents bucket. No public URL: apps/api streams it through the
// authenticated `GET /media/:mediaId/download` route.
export function getMediaDocumentKey({ ownerId, mediaId }: { ownerId: string; mediaId: string }): string {
  return `${ownerId}/media/${mediaId}`;
}
