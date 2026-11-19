/** Like `Promise.allSettled(items.map(fn))`, but runs at most `concurrency` calls at once. Results keep input order. */
export async function mapSettledWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  // Workers share one iterator, so each item is taken exactly once.
  const queue = items.entries();

  async function runWorker(): Promise<void> {
    for (const [index, item] of queue) {
      try {
        results[index] = { status: 'fulfilled', value: await fn(item) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}
