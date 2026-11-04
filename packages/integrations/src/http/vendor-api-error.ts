export type VendorErrorKind = 'auth' | 'not_found' | 'gone' | 'rate_limited' | 'server' | 'other';

export interface VendorApiErrorParams {
  vendor: string;
  status: number;
  /** The vendor's machine-readable error code, never its message or body. */
  code?: string;
  retryAfterMs?: number;
  /** Where it happened, e.g. `GET /me/messages`. Never a query string, token or body. */
  detail?: string;
}

function toErrorKind(status: number): VendorErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 410) return 'gone';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'other';
}

function formatMessage({ vendor, status, code, detail }: VendorApiErrorParams): string {
  const codePart = code ? ` ${code}` : '';
  const detailPart = detail ? ` (${detail})` : '';
  return `${vendor} API error ${status}${codePart}${detailPart}`;
}

/** The one error a vendor client throws. Callers branch on `kind`, not on vendor status bodies. */
export class VendorApiError extends Error {
  readonly vendor: string;
  readonly status: number;
  readonly kind: VendorErrorKind;
  readonly code: string | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(params: VendorApiErrorParams) {
    super(formatMessage(params));
    this.name = 'VendorApiError';
    this.vendor = params.vendor;
    this.status = params.status;
    this.kind = toErrorKind(params.status);
    this.code = params.code;
    this.retryAfterMs = params.retryAfterMs;
  }
}

export function isVendorErrorKind(error: unknown, kind: VendorErrorKind): boolean {
  return error instanceof VendorApiError && error.kind === kind;
}
