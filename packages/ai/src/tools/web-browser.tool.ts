import type { InferToolInput, InferToolOutput, Tool, UIMessage, UIMessageStreamWriter } from 'ai';
import { tool } from 'ai';
import * as z from 'zod';

const webBrowserSchema = z.object({
  url: z
    .url()
    .min(10)
    .max(1000)
    .refine((url) => url.startsWith('https://'), {
      message: 'URL must start with https://',
    })
    .describe('The valid HTTPS URL of the website to visit.'),
});

type WebBrowserInput = z.infer<typeof webBrowserSchema>;
type WebBrowserOutput = {
  meta: null;
  body: string;
};

export const getWebBrowserResults = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
): Tool<WebBrowserInput, WebBrowserOutput> =>
  tool({
    description: 'Use this tool to browse the web and retrieve the content of a webpage.',
    inputSchema: webBrowserSchema,
    execute: async ({ url }) => {
      // TODO: Make the server URL configurable
      const webBrowserServerUrl = 'http://localhost:3010/scrape';
      const newURL = new URL(url);
      if (newURL.protocol !== 'https:') {
        throw new Error('Invalid URL protocol - must be HTTPS');
      }

      const targetURL = newURL.toString();
      const searchParams = new URLSearchParams();
      searchParams.append('url', targetURL);

      writer.write({
        type: 'data-webBrowser',
        data: { url: targetURL },
        transient: true,
      });

      try {
        const response = await fetch(`${webBrowserServerUrl}?${searchParams.toString()}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok !== true || !response.body) {
          throw new Error('Failed to scrape');
        }

        const data = (await response.json()) as { body: string; meta: any };

        return {
          meta: null,
          body: data?.body as string,
        };
      } catch {
        return {
          meta: null,
          body: 'cannot visit website. does it exist?',
        };
      }
    },
  });

export type getWebBrowserResultsInput = InferToolInput<ReturnType<typeof getWebBrowserResults>>;
export type getWebBrowserResultsOutput = InferToolOutput<ReturnType<typeof getWebBrowserResults>>;
