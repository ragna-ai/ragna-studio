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
