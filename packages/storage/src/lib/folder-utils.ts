export interface FileWithPath {
  file: File;
  relativePath: string;
}

export const MAX_DEPTH = 10;

/**
 * Format the relative path to use forward slashes and remove leading slashes
 */
export function formatRelativePath(input: { path: string }): string {
  let inputpath = input.path;
  // remove first slash if present
  if (inputpath.startsWith('/')) {
    inputpath = inputpath.slice(1);
  }
  // Normalize to use forward slashes
  return inputpath.replace(/\\/g, '/');
}

export function formatDroppedFiles({ files }: { files: File[] }): FileWithPath[] {
  const filesWithPaths: FileWithPath[] = files.map((file) => ({
    file,
    relativePath: formatRelativePath({ path: (file as any).relativePath }) || file.name,
  }));

  return filesWithPaths;
}

/**
 * Calculate the depth of a path
 */
export function getPathDepth({ path }: { path: string }): number {
  return path.split('/').filter(Boolean).length;
}

/**
 * Validate that all file paths are within the max depth limit
 */
export function validatePathDepths({ files }: { files: FileWithPath[] }): boolean {
  return files.every((f) => getPathDepth({ path: f.relativePath }) <= MAX_DEPTH);
}
