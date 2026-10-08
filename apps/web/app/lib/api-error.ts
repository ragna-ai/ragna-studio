type FetchErrorWithData = { data?: unknown; code?: unknown };

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

function hasErrorCode(value: unknown): value is { code: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as { code: unknown }).code === 'number'
  );
}

// HTTP 402, thrown by `assertCanSpend` (specs/credits/prd.md) when the
// account has no credits left.
const PAYMENT_REQUIRED_CODE = 402;

export const OUT_OF_CREDITS_MESSAGE =
  "You're out of credits. Check your balance in the account menu.";

/**
 * True for an ofetch error whose parsed body is `{ code: 402, ... }` (the
 * global `onError` envelope, apps/api/src/app.ts), and also for the `Error`
 * thrown by `WebSocketChatTransport` on a `code: 402` WS error frame, which
 * carries `code` directly on the error rather than nested under `.data`.
 * Checking both shapes here is what lets the HTTP and WS chat paths share
 * one "out of credits" message (specs/credits/prd.md, "Frontend").
 */
export function isOutOfCreditsError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const { code, data } = error as FetchErrorWithData;
  if (typeof code === 'number') {
    return code === PAYMENT_REQUIRED_CODE;
  }
  return hasErrorCode(data) && data.code === PAYMENT_REQUIRED_CODE;
}

/**
 * Turns a failed $fetch/ofetch call into a user-facing message: distinguishes
 * "out of credits" first, then prefers an `errors: string[]` list (e.g.
 * workflow publish validation failures), falls back to a plain
 * `{ error: string }` body, then a generic fallback.
 */
export function extractErrorMessage(error: unknown, fallback: string): string {
  if (isOutOfCreditsError(error)) {
    return OUT_OF_CREDITS_MESSAGE;
  }
  const data = (error as FetchErrorWithData | undefined)?.data;
  if (hasErrorList(data)) {
    return data.errors.join(', ');
  }
  if (hasErrorMessage(data)) {
    return data.error;
  }
  return fallback;
}
