type FetchErrorWithData = { data?: unknown };

function hasErrorList(data: unknown): data is { errors: string[] } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'errors' in data &&
    Array.isArray((data as { errors: unknown }).errors)
  );
}

function hasErrorMessage(data: unknown): data is { error: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as { error: unknown }).error === 'string'
  );
}

/**
 * Turns a failed $fetch/ofetch call into a user-facing message: prefers an
 * `errors: string[]` list (e.g. workflow publish validation failures), falls
 * back to a plain `{ error: string }` body, then a generic fallback.
 */
export function extractErrorMessage(error: unknown, fallback: string): string {
  const data = (error as FetchErrorWithData | undefined)?.data;
  if (hasErrorList(data)) {
    return data.errors.join(', ');
  }
  if (hasErrorMessage(data)) {
    return data.error;
  }
  return fallback;
}
