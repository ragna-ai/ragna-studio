export function formatFileSize(bytes: number): string {
  if (bytes < 0) {
    return '-';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 ** 2) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  if (bytes < 1024 ** 3) {
    return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  }
  if (bytes < 1024 ** 4) {
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  }
  return `${(bytes / 1024 ** 4).toFixed(2)} TB`;
}
