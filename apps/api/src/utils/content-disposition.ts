const UNSAFE_FALLBACK_CHARS = /["\\%]|[^\u0020-\u007e]/g;
const RFC_5987_RESERVED_CHARS = /['()*]/g;
const DEFAULT_FILENAME = 'download';

function toAsciiFallback(filename: string): string {
  return filename.replace(UNSAFE_FALLBACK_CHARS, '_');
}

function toRfc5987Value(filename: string): string {
  return encodeURIComponent(filename).replace(
    RFC_5987_RESERVED_CHARS,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Builds an RFC 6266 `attachment` Content-Disposition value that is safe for
 * any filename: an ASCII `filename` fallback plus an RFC 5987 `filename*`.
 */
export function buildAttachmentContentDisposition(filename: string): string {
  const name = filename.trim() === '' ? DEFAULT_FILENAME : filename;
  return `attachment; filename="${toAsciiFallback(name)}"; filename*=UTF-8''${toRfc5987Value(name)}`;
}
