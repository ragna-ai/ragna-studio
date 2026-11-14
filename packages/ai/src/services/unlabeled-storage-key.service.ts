const UNLABELED_SEGMENT = 'unlabeled';

/** Internal key prefix for a generated output that waits for its visible watermark. */
export function toUnlabeledPrefix(prefix: string): string {
  return `${prefix}/${UNLABELED_SEGMENT}`;
}

/** Final key of a labeled output: the raw key without its `unlabeled` segment. */
export function toLabeledStorageKey(rawKey: string): string {
  const segment = `/${UNLABELED_SEGMENT}/`;
  if (!rawKey.includes(segment)) {
    throw new Error(`Storage key is not an unlabeled key: ${rawKey}`);
  }

  return rawKey.replace(segment, '/');
}
