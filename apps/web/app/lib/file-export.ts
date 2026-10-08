/**
 * Shared plumbing for "export as file" features (dataset rows, documents):
 * build the same-shaped fallback filename and save an already-fetched Blob
 * via a temporary object URL. Kept feature-agnostic (no format unions here)
 * so both dataset and document exports can share it without a fake coupling
 * between their otherwise-unrelated format lists.
 */

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Mirrors the server's `<slug>-<yyyy-mm-dd>.<ext>` naming
// (specs/datasets/export-and-row-reorder.md), used when the response carries
// no (or an unparsable) Content-Disposition header.
export function buildExportFilename(title: string, extension: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${slugify(title)}-${today}.${extension}`;
}

export function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /filename="?([^";]+)"?/.exec(header);
  return match?.[1] ?? null;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}
