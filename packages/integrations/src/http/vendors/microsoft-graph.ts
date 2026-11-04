import * as z from 'zod';
import type { VendorApi } from '../vendor-client';

const graphErrorBodySchema = z.object({ error: z.object({ code: z.string() }) });

function parseGraphErrorCode(body: string): string | undefined {
  try {
    const parsed = graphErrorBodySchema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data.error.code : undefined;
  } catch {
    return undefined;
  }
}

/** Microsoft Graph v1.0. One API for every Microsoft capability: mail, files, calendar. */
export const MICROSOFT_GRAPH_API: VendorApi = {
  name: 'Microsoft Graph',
  baseUrl: 'https://graph.microsoft.com/v1.0',
  parseErrorCode: parseGraphErrorCode,
};
