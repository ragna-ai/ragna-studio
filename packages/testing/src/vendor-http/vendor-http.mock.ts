// packages/testing/src/vendor-http/vendor-http.mock.ts
//
// Fakes the vendor APIs the real capability adapters call (Gmail, Microsoft Graph).
// Wired into the single fetch fake in provider-http.mock.ts. Per-test overrides win,
// then the base routes answer a happy-path mailbox. A request to a vendor host that
// no route matches throws, so a missing fixture never reaches the real API.
import { GOOGLE_DRIVE_ROUTES } from '../cloud-drive/vendors/google-drive.routes';
import { GMAIL_MAILBOX_ROUTES } from '../mail/vendors/gmail.routes';
import { GRAPH_MAILBOX_ROUTES } from '../mail/vendors/graph.routes';
import {
  VENDOR_HOSTS,
  vendorJson,
  type VendorEndpoint,
  type VendorHost,
  type VendorHttpMethod,
  type VendorRequest,
  type VendorRoute,
} from './vendor-route';

const BASE_ROUTES: readonly VendorRoute[] = GMAIL_MAILBOX_ROUTES.concat(
  GRAPH_MAILBOX_ROUTES,
  GOOGLE_DRIVE_ROUTES,
);

const HTTP_METHODS: readonly VendorHttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

interface VendorOverride {
  route: VendorRoute;
  remaining: number;
}

export interface VendorHttpState {
  /** Every request a vendor host received, in order. */
  requests: VendorRequest[];
  overrides: VendorOverride[];
  /** Retry delays the real adapters asked for, in milliseconds. */
  sleeps: number[];
}

export const vendorHttp: VendorHttpState = { requests: [], overrides: [], sleeps: [] };

export function resetVendorHttpMock(): void {
  vendorHttp.requests = [];
  vendorHttp.overrides = [];
  vendorHttp.sleeps = [];
}

/** Stands in for the adapters' retry sleep: records the delay and resolves at once. */
export function recordVendorSleep(ms: number): Promise<void> {
  vendorHttp.sleeps.push(ms);
  return Promise.resolve();
}

export interface VendorOverrideOptions {
  /** How many matching requests the override answers before the base route takes over again. */
  times?: number;
}

/** Answers one endpoint differently for the current test. The newest override wins. */
export function overrideVendorRoute(route: VendorRoute, options: VendorOverrideOptions = {}): void {
  vendorHttp.overrides.unshift({ route, remaining: options.times ?? Number.POSITIVE_INFINITY });
}

export interface VendorFailure {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  times?: number;
}

/** Makes one endpoint answer with an error status for the current test. */
export function failVendorEndpoint(endpoint: VendorEndpoint, failure: VendorFailure): void {
  overrideVendorRoute(
    {
      method: endpoint.method,
      host: endpoint.host,
      path: endpoint.path,
      respond: () =>
        vendorJson(failure.body ?? { error: { code: 'fakeFailure' } }, {
          status: failure.status,
          headers: failure.headers,
        }),
    },
    { times: failure.times },
  );
}

/** The requests a vendor host received for one endpoint. */
export function vendorRequestsTo(endpoint: VendorEndpoint): VendorRequest[] {
  return vendorHttp.requests.filter(
    (request) =>
      request.method === endpoint.method &&
      request.url.hostname === endpoint.host &&
      endpoint.path.test(request.url.pathname),
  );
}

export function isVendorHost(url: URL): boolean {
  return VENDOR_HOSTS.some((host: VendorHost) => host === url.hostname);
}

function readMethod(init: RequestInit | undefined): VendorHttpMethod {
  const method = (init?.method ?? 'GET').toUpperCase();
  const known = HTTP_METHODS.find((candidate) => candidate === method);
  if (!known) {
    throw new Error(`Vendor HTTP fake: unsupported method ${method}`);
  }
  return known;
}

function readBody(body: RequestInit['body']): string | null {
  if (body === undefined || body === null) return null;
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) return Buffer.from(body).toString('utf-8');
  return String(body);
}

export function toVendorRequest(url: URL, init: RequestInit | undefined): VendorRequest {
  return {
    method: readMethod(init),
    url,
    headers: new Headers(init?.headers),
    body: readBody(init?.body),
  };
}

function matchRoute(route: VendorRoute, request: VendorRequest): RegExpMatchArray | null {
  if (route.method !== request.method || route.host !== request.url.hostname) return null;
  return request.url.pathname.match(route.path);
}

/** Answers from a per-test override, or null when none matches. */
export async function answerVendorOverride(request: VendorRequest): Promise<Response | null> {
  for (const override of vendorHttp.overrides) {
    if (override.remaining <= 0) continue;
    const match = matchRoute(override.route, request);
    if (!match) continue;

    override.remaining -= 1;
    vendorHttp.requests.push(request);
    return override.route.respond(request, match);
  }
  return null;
}

/** Answers from the base routes. Throws for a vendor URL no route covers. */
export async function answerVendorBaseRoute(request: VendorRequest): Promise<Response> {
  vendorHttp.requests.push(request);

  for (const route of BASE_ROUTES) {
    const match = matchRoute(route, request);
    if (match) return route.respond(request, match);
  }

  throw new Error(
    `Vendor HTTP fake: no route for ${request.method} ${request.url.toString()}. Add a base route or a test override.`,
  );
}
