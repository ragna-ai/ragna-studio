export function retryExpoBackoff(
  fn: () => Promise<any>,
  maxRetries = 3,
  initialDelay = 1000,
  maxDelay = 30000,
  shouldRetry?: (error: any) => boolean,
): Promise<any> {
  let attempt = 0;

  const defaultShouldRetry = (error: any): boolean => {
    // Only retry on transient errors
    if (
      error?.code === 'ECONNRESET' ||
      error?.code === 'ETIMEDOUT' ||
      error?.code === 'ENOTFOUND' ||
      error?.message?.includes('timeout') ||
      error?.status >= 500
    ) {
      return true;
    }
    return false;
  };

  const executeWithBackoff = async (): Promise<any> => {
    try {
      return await fn();
    } catch (error) {
      const retryCheck = shouldRetry || defaultShouldRetry;

      if (attempt >= maxRetries || !retryCheck(error)) {
        throw error;
      }

      attempt++;
      const delay = Math.min(initialDelay * 2 ** (attempt - 1), maxDelay);

      await new Promise((resolve) => setTimeout(resolve, delay));
      return executeWithBackoff();
    }
  };

  return executeWithBackoff();
}
