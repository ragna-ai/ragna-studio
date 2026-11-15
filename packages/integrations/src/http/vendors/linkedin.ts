import * as z from 'zod';
import type { VendorApi } from '../vendor-client';

/** LinkedIn retires each monthly version about a year after release: bump before then. */
export const LINKEDIN_API_VERSION = '202610';

const linkedinErrorBodySchema = z.object({ code: z.string() });

function parseLinkedinErrorCode(body: string): string | undefined {
  try {
    const parsed = linkedinErrorBodySchema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data.code : undefined;
  } catch {
    return undefined;
  }
}

export const LINKEDIN_API: VendorApi = {
  name: 'LinkedIn',
  baseUrl: 'https://api.linkedin.com/rest',
  parseErrorCode: parseLinkedinErrorCode,
};
