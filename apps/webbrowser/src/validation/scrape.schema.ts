import * as z from 'zod';

export const scrapeQuerySchema = z.object({
  url: z.url().refine((value) => value.startsWith('https://'), {
    message: 'URL must start with https://',
  }),
});

export type ScrapeQuery = z.infer<typeof scrapeQuerySchema>;
