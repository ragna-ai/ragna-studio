// packages/media/src/index.ts
//
// @repo/media: the media domain (docs/media-library/unified-media-prd.md).
// Owns the media type registry (kinds, mime types, magic-byte sniffing,
// extractable flags), the extraction engine, storage placement, media row
// creation, and refcounted deletion. Dependency direction:
// database/storage -> media -> (ai, apps). Nothing in @repo/media may
// depend on an app.

export { DOCUMENT_KINDS, IMAGE_KINDS, MIME_TYPE_BY_MEDIA_KIND } from './types';
export type { MediaKind, SniffedMedia } from './types';

export { sniffMediaKind } from './services/registry.service';

export { extractText } from './services/extract.service';

export {
  buildChatUploadImageUrls,
  getChatUploadImageKey,
  getMediaDocumentKey,
} from './lib/media-keys';

export {
  createMediaForObject,
  deleteMediaIfUnreferenced,
  storeMedia,
  sweepUnreferencedMedia,
} from './services/media.service';
export type {
  CreateMediaForObjectInput,
  MediaOwner,
  StoreMediaInput,
  SweepUnreferencedMediaResult,
} from './services/media.service';
