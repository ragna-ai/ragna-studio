// Postgres allows 65,535 bind parameters per statement; this stays far below it.
export const BATCH_WRITE_CHUNK_SIZE = 500;

/** Keeps the last row per key. Postgres rejects an upsert that hits one row twice. */
export function dedupeKeepLast<T>(rows: readonly T[], keyOf: (row: T) => string): T[] {
  return Array.from(new Map(rows.map((row) => [keyOf(row), row])).values());
}

export function chunkRows<T>(rows: readonly T[], size = BATCH_WRITE_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < rows.length; start += size) {
    chunks.push(rows.slice(start, start + size));
  }
  return chunks;
}
