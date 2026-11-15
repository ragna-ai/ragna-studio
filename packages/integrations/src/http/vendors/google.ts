import * as z from 'zod';
import type { VendorApi } from '../vendor-client';

const reasonsSchema = z.array(z.object({ reason: z.string().optional() })).optional();

const googleErrorBodySchema = z.object({
  error: z.object({
    status: z.string().optional(),
    errors: reasonsSchema,
    details: reasonsSchema,
  }),
});

const GOOGLE_RATE_LIMIT_CODES: readonly string[] = [
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'sharingRateLimitExceeded',
  'RATE_LIMIT_EXCEEDED',
];

/** A rate-limit reason wins wherever it sits, then the first reason, then the generic status (`PERMISSION_DENIED`). */
function parseGoogleErrorCode(body: string): string | undefined {
  try {
    const parsed = googleErrorBodySchema.safeParse(JSON.parse(body));
    if (!parsed.success) return undefined;
    const { errors, details, status } = parsed.data.error;
    const reasons = [...(errors ?? []), ...(details ?? [])].flatMap(({ reason }) =>
      reason ? [reason] : [],
    );
    return (
      reasons.find((reason) => GOOGLE_RATE_LIMIT_CODES.includes(reason)) ?? reasons[0] ?? status
    );
  } catch {
    return undefined;
  }
}

export interface GoogleApiParams {
  name: string;
  baseUrl: string;
}

/** Google REST APIs share one error format but each product has its own base URL. */
export function googleApi({ name, baseUrl }: GoogleApiParams): VendorApi {
  return {
    name,
    baseUrl,
    parseErrorCode: parseGoogleErrorCode,
    rateLimitCodes: GOOGLE_RATE_LIMIT_CODES,
  };
}
