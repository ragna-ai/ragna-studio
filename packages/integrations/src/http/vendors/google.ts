import * as z from 'zod';
import type { VendorApi } from '../vendor-client';

const googleErrorBodySchema = z.object({
  error: z.object({
    status: z.string().optional(),
    errors: z.array(z.object({ reason: z.string() })).optional(),
  }),
});

/** Prefers the specific reason (`rateLimitExceeded`) over the generic status (`PERMISSION_DENIED`). */
function parseGoogleErrorCode(body: string): string | undefined {
  try {
    const parsed = googleErrorBodySchema.safeParse(JSON.parse(body));
    if (!parsed.success) return undefined;
    return parsed.data.error.errors?.[0]?.reason ?? parsed.data.error.status;
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
  return { name, baseUrl, parseErrorCode: parseGoogleErrorCode };
}
