// packages/mail/src/provider/gmail/gmail.client.ts
//
// Thin authorized fetch wrapper for the Gmail REST API v1, with retry on
// transient failures (429 / 5xx). Callers are responsible for interpreting a
// 404 where it's meaningful (e.g. `users.history.list` on an expired cursor).

import { retryExpoBackoff } from '@repo/utils';

const GMAIL_API_BASE_URL = 'https://gmail.googleapis.com/gmail/v1';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8_000;

export class GmailApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = 'GmailApiError';
  }

  static async fromResponse(response: Response, label = 'Gmail API error'): Promise<GmailApiError> {
    const body = await response.text();
    return new GmailApiError(
      `${label}: ${response.status} ${response.statusText}`,
      response.status,
      body,
    );
  }
}

export interface GmailRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: string;
}

/** GETs, POSTs or PUTs a Gmail REST path (relative to `/gmail/v1/`), retrying transient failures. */
export async function gmailRequest<T>(
  getAccessToken: () => Promise<string>,
  path: string,
  options: GmailRequestOptions = {},
): Promise<T> {
  return retryExpoBackoff(
    () => performGmailRequest<T>(getAccessToken, path, options),
    MAX_RETRIES,
    INITIAL_RETRY_DELAY_MS,
    MAX_RETRY_DELAY_MS,
    isRetryableGmailError,
  );
}

/** Same as `gmailRequest`, for endpoints that reply with an empty body (e.g. `DELETE`). */
export async function gmailRequestVoid(
  getAccessToken: () => Promise<string>,
  path: string,
  options: GmailRequestOptions = {},
): Promise<void> {
  return retryExpoBackoff(
    () => performGmailRequestVoid(getAccessToken, path, options),
    MAX_RETRIES,
    INITIAL_RETRY_DELAY_MS,
    MAX_RETRY_DELAY_MS,
    isRetryableGmailError,
  );
}

function isRetryableGmailError(error: unknown): boolean {
  return error instanceof GmailApiError && (error.status === 429 || error.status >= 500);
}

async function performGmailRequest<T>(
  getAccessToken: () => Promise<string>,
  path: string,
  options: GmailRequestOptions,
): Promise<T> {
  const response = await fetchGmail(getAccessToken, path, options);
  return (await response.json()) as T;
}

async function performGmailRequestVoid(
  getAccessToken: () => Promise<string>,
  path: string,
  options: GmailRequestOptions,
): Promise<void> {
  await fetchGmail(getAccessToken, path, options);
}

async function fetchGmail(
  getAccessToken: () => Promise<string>,
  path: string,
  options: GmailRequestOptions,
): Promise<Response> {
  const accessToken = await getAccessToken();

  const response = await fetch(`${GMAIL_API_BASE_URL}/${path}`, {
    method: options.method ?? 'GET',
    body: options.body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw await GmailApiError.fromResponse(response);
  }

  return response;
}
