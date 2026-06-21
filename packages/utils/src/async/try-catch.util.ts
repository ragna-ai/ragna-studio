import { retryExpoBackoff } from '../retry/retry-backoff.util';

export async function tryCatch<T>(
  fn: () => Promise<T>,
  {
    options,
    retryOnFailure = false,
  }: {
    options?: {
      retries: number;
      initialDelay?: number;
      maxDelay?: number;
      shouldRetry?: (error: any) => boolean;
    };
    retryOnFailure?: boolean;
  } = {},
): Promise<{ data: T | null; error: Error | null }> {
  try {
    // Default retries for read operations
    const defaultRetries = retryOnFailure ? 3 : 0;
    const retries = options?.retries ?? defaultRetries;

    const data = await retryExpoBackoff(
      fn,
      retries,
      options?.initialDelay,
      options?.maxDelay,
      options?.shouldRetry,
    );
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}
