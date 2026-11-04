import { isVendorErrorKind } from '@repo/integrations/http';

/** Distinct from a transient 429/5xx: the token was rejected outright. */
export function isMailAuthError(error: unknown): boolean {
  return isVendorErrorKind(error, 'auth');
}

export function isMailNotFoundError(error: unknown): boolean {
  return isVendorErrorKind(error, 'not_found');
}
