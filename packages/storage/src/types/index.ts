export interface BucketDocument {
  storageKey: string;
  mimeType: string;
}

export type SupportedDocumentKind = 'pdf' | 'docx' | 'txt' | 'md';

export const MIME_TYPE_BY_KIND: Record<SupportedDocumentKind, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
};

// Chat attachment kinds (docs/media-library/prd.md). A separate set from
// SupportedDocumentKind above: agent context documents don't accept images,
// xlsx, or csv, and are out of scope for the media core migration.
export type ChatMediaKind = 'png' | 'jpeg' | 'webp' | 'pdf' | 'docx' | 'xlsx' | 'csv' | 'txt' | 'md';

export const MIME_TYPE_BY_CHAT_MEDIA_KIND: Record<ChatMediaKind, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
};

export interface SniffedChatMedia {
  kind: ChatMediaKind;
  mimeType: string;
}
