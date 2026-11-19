import { config } from '@repo/config';
import { logger } from '@repo/logger';
import * as z from 'zod';
import type { ToolDefinition, ToolFailure, ToolOutput } from './tool-definition';

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

// `truncated` defaults to false for a webbrowser service from before it reported the flag.
const scrapeResponseSchema = z.object({
  body: z.string(),
  truncated: z.boolean().optional().default(false),
});

// Matches the webbrowser service's response when its scrape queue is full.
const BROWSER_BUSY_STATUS = 503;
const SCRAPE_TIMEOUT_MS = 30_000;

/** What a successful page visit returns to the model. */
export const webBrowserOutputSchema = z.strictObject({
  meta: z.null(),
  body: z.string(),
  /** True when the page was longer than the browser's limit and got cut off. */
  truncated: z.boolean(),
});

export type WebBrowserPage = z.infer<typeof webBrowserOutputSchema>;

type WebBrowserFailureStatus = 'invalid_url' | 'busy' | 'unreachable';
type WebBrowserOutput = ToolOutput<typeof webBrowserOutputSchema, WebBrowserFailureStatus>;

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

  return { meta: null, body: parsed.data.body, truncated: parsed.data.truncated };
}

export const webBrowserToolDefinition: ToolDefinition<
  typeof webBrowserInputSchema,
  typeof webBrowserOutputSchema,
  WebBrowserFailureStatus
> = {
  name: 'webBrowser',
  description:
    'Use this tool to browse the web and retrieve the content of a webpage as markdown. Long pages are cut off and marked truncated.',
  inputSchema: webBrowserInputSchema,
  outputSchema: webBrowserOutputSchema,
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
