// Client-side mirror of the API's accepted chat attachment types and size
// limit, so an obviously invalid
// file never has to make a round trip. The server re-validates by content
// sniffing regardless.
export const CHAT_ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const CHAT_ATTACHMENT_ACCEPT_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.pdf',
  '.docx',
  '.pptx',
  '.xlsx',
  '.csv',
  '.txt',
  '.md',
] as const;

const CHAT_ATTACHMENT_IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
] as const;

// Passed straight to the hidden file input's `accept` attribute.
export const CHAT_ATTACHMENT_ACCEPT =
  CHAT_ATTACHMENT_ACCEPT_EXTENSIONS.join(',');

function getFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex === -1 ? '' : filename.slice(dotIndex).toLowerCase();
}

// Extension-based, not `file.type`-based: browsers report inconsistent or
// empty MIME types for docx/xlsx/md across operating systems, while the
// extension is reliable enough for this "immediate feedback" pre-filter.
export function isAcceptedChatAttachment(filename: string): boolean {
  return (CHAT_ATTACHMENT_ACCEPT_EXTENSIONS as readonly string[]).includes(
    getFileExtension(filename),
  );
}

export function isImageFilename(filename: string): boolean {
  return (CHAT_ATTACHMENT_IMAGE_EXTENSIONS as readonly string[]).includes(
    getFileExtension(filename),
  );
}

export function isImageMediaType(mediaType: string): boolean {
  return mediaType.startsWith('image/');
}

// vscode-icons file-type icons, keyed by extension. Covers exactly the
// document kinds this repo's attachments accept;
// images never reach this map since they render as an actual thumbnail
// instead of a file-type icon.
const FILE_TYPE_ICON_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'vscode-icons:file-type-pdf2',
  '.docx': 'vscode-icons:file-type-word',
  '.pptx': 'vscode-icons:file-type-powerpoint',
  '.xlsx': 'vscode-icons:file-type-excel',
  '.csv': 'vscode-icons:file-type-excel',
  '.txt': 'vscode-icons:file-type-text',
  '.md': 'vscode-icons:file-type-markdown',
};

const DEFAULT_FILE_TYPE_ICON = 'vscode-icons:default-file';

export function getFileTypeIconName(filename: string): string {
  return (
    FILE_TYPE_ICON_BY_EXTENSION[getFileExtension(filename)] ??
    DEFAULT_FILE_TYPE_ICON
  );
}
