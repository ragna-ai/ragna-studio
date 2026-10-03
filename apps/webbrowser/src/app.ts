import { logger } from '@repo/logger';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { logger as honoLogger } from 'hono/logger';
import { ReasonPhrases, StatusCodes } from 'http-status-codes';
import { scrapePage } from './services/browser.service';
import { UrlNotAllowedError } from './utils/url-guard';
import { scrapeQuerySchema } from './validation/scrape.schema';

export const app = new Hono()
  .use(honoLogger((message, ...rest) => logger.log(message, ...rest)))
  .get('/health', (c) => c.json({ status: 'ok' }))
  .get(
    '/scrape',
    zValidator('query', scrapeQuerySchema, (result) => {
      if (!result.success) {
        throw new HTTPException(StatusCodes.BAD_REQUEST, {
          message: 'Invalid URL',
        });
      }
    }),
    async (c) => {
      const { url } = c.req.valid('query');

      try {
        const result = await scrapePage(url);
        return c.json(result);
      } catch (error) {
        if (error instanceof UrlNotAllowedError) {
          logger.warn('Rejected scrape request for a URL that is not allowed');
          throw new HTTPException(StatusCodes.BAD_REQUEST, {
            message: 'URL is not allowed',
          });
        }
        logger.error(`Failed to scrape ${url}:`, error);
        throw new HTTPException(StatusCodes.INTERNAL_SERVER_ERROR, {
          message: 'An error occurred while scraping the page',
        });
      }
    },
  )
  .onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ code: err.status, error: err.message }, err.status);
    }

    logger.error('Unhandled error in webbrowser service', err);

    return c.json(
      { code: StatusCodes.INTERNAL_SERVER_ERROR, error: ReasonPhrases.INTERNAL_SERVER_ERROR },
      StatusCodes.INTERNAL_SERVER_ERROR,
    );
  });

export type AppType = typeof app;
