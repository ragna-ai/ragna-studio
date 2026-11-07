import { config } from '@repo/config';
import { logger } from '@repo/logger';
import * as z from 'zod';
import type { ToolDefinition, ToolFailure } from './tool-definition';

const webBrowserInputSchema = z.object({
  url: z
    .url()
    .min(10)
    .max(1000)
    .refine((url) => url.startsWith('https://'), {
      message: 'URL must start with https://',
    })
    .describe('The valid HTTPS URL of the website to visit.'),
});

const scrapeResponseSchema = z.object({ body: z.string() });

// Matches the webbrowser service's response when its scrape queue is full.
const BROWSER_BUSY_STATUS = 503;
const SCRAPE_TIMEOUT_MS = 30_000;

interface WebBrowserPage {
  meta: null;
  body: string;
}

type WebBrowserOutput = WebBrowserPage | ToolFailure<'invalid_url' | 'busy' | 'unreachable'>;

const unreachable: ToolFailure<'unreachable'> = {
  status: 'unreachable',
  message: 'Cannot visit the website. Check that the URL exists, or continue without it.',
};

async function scrape(targetUrl: string): Promise<WebBrowserOutput> {
  const searchParams = new URLSearchParams({ url: targetUrl });
  const response = await fetch(`${config.webBrowserBaseUrl}/scrape?${searchParams.toString()}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
  });

  if (response.status === BROWSER_BUSY_STATUS) {
    return { status: 'busy', message: 'The web browser is busy right now. Try again shortly.' };
  }

  if (!response.ok) {
    logger.warn('Web browser service returned an error status', response.status);
    return unreachable;
  }

  const parsed = scrapeResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    logger.warn('Web browser service returned an unexpected body', parsed.error.issues);
    return unreachable;
  }

  return { meta: null, body: parsed.data.body };
}

export const webBrowserToolDefinition: ToolDefinition<
  typeof webBrowserInputSchema,
  WebBrowserOutput
> = {
  name: 'webBrowser',
  description: 'Use this tool to browse the web and retrieve the content of a webpage.',
  inputSchema: webBrowserInputSchema,
  access: 'read',
  execute: async ({ url }) => {
    if (!URL.canParse(url)) {
      return { status: 'invalid_url', message: 'The URL is not valid. Use a full HTTPS URL.' };
    }
    const target = new URL(url);
    if (target.protocol !== 'https:') {
      return { status: 'invalid_url', message: 'The URL must use HTTPS.' };
    }

    try {
      return await scrape(target.toString());
    } catch (error) {
      logger.warn('Web browser request failed', error);
      return unreachable;
    }
  },
};
