import { VendorApiError } from './vendor-api-error';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8_000;
/** A longer `Retry-After` fails the call instead of holding a request or job that long. */
const MAX_RETRY_AFTER_MS = 30_000;

export type VendorHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** What differs between vendor APIs. Everything else about a call is shared. */
export interface VendorApi {
  name: string;
  baseUrl: string;
  /** Reads the vendor's machine-readable error code from an error response body. */
  parseErrorCode: (body: string) => string | undefined;
}

export interface VendorClientOptions {
  /** Called before every attempt, so a retry after a 401 can pick up a refreshed token. */
  getAccessToken: () => Promise<string>;
  /** Sent on every authorized request, on top of the JSON content type. */
  headers?: Readonly<Record<string, string>>;
  /** Waits between retries. Tests pass a recorder instead of a timer. */
  sleep?: (ms: number) => Promise<void>;
}

export interface VendorRequestOptions {
  method?: VendorHttpMethod;
  body?: string;
}

export interface VendorRawRequestOptions {
  method: VendorHttpMethod;
  body?: RequestInit['body'];
  headers?: Readonly<Record<string, string>>;
  /** False for pre-authenticated URLs (upload sessions) that reject an Authorization header. */
  authorize: boolean;
}

export interface VendorClient {
  /** JSON request to a path under the API base URL, or to an absolute URL the vendor returned. */
  request<T>(path: string, options?: VendorRequestOptions): Promise<T>;
  /** Same as `request`, for endpoints that reply with an empty body. */
  requestVoid(path: string, options?: VendorRequestOptions): Promise<void>;
  /** Returns the successful raw response, for callers that read headers or status themselves. */
  requestRaw(path: string, options: VendorRawRequestOptions): Promise<Response>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const dateMs = Date.parse(value);
  return Number.isNaN(dateMs) ? undefined : Math.max(0, dateMs - Date.now());
}

function isRetryable(error: unknown): error is VendorApiError {
  return (
    error instanceof VendorApiError &&
    (error.kind === 'rate_limited' || error.kind === 'server' || error.kind === 'auth')
  );
}

function retryDelayMs(error: unknown, attempt: number): number | null {
  if (attempt >= MAX_RETRIES || !isRetryable(error)) return null;
  if (error.retryAfterMs === undefined) {
    return Math.min(INITIAL_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
  }
  return error.retryAfterMs <= MAX_RETRY_AFTER_MS ? error.retryAfterMs : null;
}

async function withRetries<T>(
  perform: () => Promise<T>,
  sleep: (ms: number) => Promise<void>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await perform();
    } catch (error) {
      const delay = retryDelayMs(error, attempt);
      if (delay === null) throw error;
      await sleep(delay);
    }
  }
}

function toRequestUrl(api: VendorApi, path: string): string {
  return path.startsWith('https://') ? path : `${api.baseUrl}/${path}`;
}

async function toVendorApiError(
  api: VendorApi,
  response: Response,
  method: VendorHttpMethod,
  url: string,
): Promise<VendorApiError> {
  const body = await response.text();
  return new VendorApiError({
    vendor: api.name,
    status: response.status,
    code: api.parseErrorCode(body),
    retryAfterMs: parseRetryAfterMs(response.headers.get('Retry-After')),
    detail: `${method} ${new URL(url).pathname}`,
  });
}

class HttpVendorClient implements VendorClient {
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly api: VendorApi,
    private readonly options: VendorClientOptions,
  ) {
    this.sleep = options.sleep ?? defaultSleep;
  }

  async request<T>(path: string, options: VendorRequestOptions = {}): Promise<T> {
    return withRetries(async () => {
      const response = await this.fetchAuthorizedJson(path, options);
      const body: unknown = await response.json();
      // Wire types follow the vendor's documented shape; the adapters' parse step reads them defensively.
      return body as T;
    }, this.sleep);
  }

  async requestVoid(path: string, options: VendorRequestOptions = {}): Promise<void> {
    await withRetries(() => this.fetchAuthorizedJson(path, options), this.sleep);
  }

  requestRaw(path: string, options: VendorRawRequestOptions): Promise<Response> {
    return withRetries(() => this.fetchChecked(path, options), this.sleep);
  }

  private fetchAuthorizedJson(path: string, options: VendorRequestOptions): Promise<Response> {
    return this.fetchChecked(path, {
      method: options.method ?? 'GET',
      body: options.body,
      headers: { 'Content-Type': 'application/json' },
      authorize: true,
    });
  }

  private async fetchChecked(path: string, options: VendorRawRequestOptions): Promise<Response> {
    const url = toRequestUrl(this.api, path);
    const headers = new Headers(options.headers);
    if (options.authorize) {
      for (const [name, value] of Object.entries(this.options.headers ?? {})) {
        headers.set(name, value);
      }
      const accessToken = await this.options.getAccessToken();
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    const response = await fetch(url, {
      method: options.method,
      body: options.body,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw await toVendorApiError(this.api, response, options.method, url);
    }
    return response;
  }
}

/** One client per connection and request or job: it holds that connection's token getter. */
export function createVendorClient(api: VendorApi, options: VendorClientOptions): VendorClient {
  return new HttpVendorClient(api, options);
}
