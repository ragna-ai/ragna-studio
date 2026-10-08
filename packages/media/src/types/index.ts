// packages/media/src/types/index.ts

// The single type vocabulary for every file the platform stores
// (specs/media-library/unified-media-prd.md, decision 2). Renamed from the
// old chat-only `ChatMediaKind`: agent context documents and chat
// attachments now share it, and `pptx` joins as a new supported kind.
export type MediaKind =
  | 'png'
  | 'jpeg'
  | 'webp'
  | 'pdf'
  | 'docx'
  | 'pptx'
  | 'xlsx'
  | 'csv'
  | 'txt'
  | 'md';

// Two exported kind sets instead of a second "category" concept
// (unified-media-prd.md, Goals). Consumers accept sets, not hand-maintained
// lists: chat attachments accept both, agent context documents accept
// DOCUMENT_KINDS only.
export const IMAGE_KINDS: readonly MediaKind[] = ['png', 'jpeg', 'webp'];

export const DOCUMENT_KINDS: readonly MediaKind[] = [
  'pdf',
  'docx',
  'pptx',
  'xlsx',
  'csv',
  'txt',
  'md',
];

export const MIME_TYPE_BY_MEDIA_KIND: Record<MediaKind, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
};

export interface SniffedMedia {
  kind: MediaKind;
  mimeType: string;
}
