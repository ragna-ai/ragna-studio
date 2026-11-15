import type { AuthResult } from '@repo/auth/client';

/** Turns a better-auth `{ data, error }` result into a value or a thrown error with the server message. */
export function unwrapAuthResult<T>(
  result: AuthResult<T>,
  fallbackMessage: string,
): T {
  if (result.error || result.data === null) {
    throw new Error(result.error?.message ?? fallbackMessage);
  }
  return result.data;
}
