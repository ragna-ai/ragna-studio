// packages/testing/src/vendor-http/vendor-route.ts

export const VENDOR_HOSTS = [
  'gmail.googleapis.com',
  'graph.microsoft.com',
  'www.googleapis.com',
] as const;

export type VendorHost = (typeof VENDOR_HOSTS)[number];

export type VendorHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface VendorRequest {
  method: VendorHttpMethod;
  url: URL;
  headers: Headers;
  body: string | null;
}

export type VendorResponder = (
  request: VendorRequest,
  match: RegExpMatchArray,
) => Response | Promise<Response>;

/** Answers one vendor endpoint. `path` is matched against the URL pathname, query excluded. */
export interface VendorRoute {
  method: VendorHttpMethod;
  host: VendorHost;
  path: RegExp;
  respond: VendorResponder;
}

/** Identifies an endpoint without an answer, so a test can override it with a failure. */
export type VendorEndpoint = Pick<VendorRoute, 'method' | 'host' | 'path'>;

export interface VendorJsonOptions {
  status?: number;
  headers?: Record<string, string>;
}

export function vendorJson(body: unknown, options: VendorJsonOptions = {}): Response {
  const headers = new Headers(options.headers);
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), { status: options.status ?? 200, headers });
}

export function vendorEmpty(status = 204, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

export function vendorRoute(endpoint: VendorEndpoint, respond: VendorResponder): VendorRoute {
  return { method: endpoint.method, host: endpoint.host, path: endpoint.path, respond };
}
