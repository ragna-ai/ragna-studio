import { auth } from '@repo/auth/server';
import { config } from '@repo/config';
import { logger } from '@repo/logger';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger as honoLogger } from 'hono/logger';
import { ReasonPhrases, StatusCodes } from 'http-status-codes';

// Origins allowed to call the API with credentials (cookies).
// Always include the web app origin so CORS holds even if TRUSTED_ORIGINS is empty.
const allowedOrigins = [config.appUrl, ...config.trustedOrigins];

export const app = new Hono()
  .basePath('/api')
  // Logger middleware
  .use(honoLogger((message, ...rest) => logger.log(message, ...rest)))
  // Cors middleware
  .use(
    cors({
      origin: allowedOrigins,
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['POST', 'GET', 'OPTIONS'],
      exposeHeaders: ['Content-Length'],
      maxAge: 600,
      credentials: true,
    }),
  )
  // Timeout middleware (15 minutes)
  // .use('*', timeout(15 * 60 * 1000))
  // Auth handler
  .on(['POST', 'GET'], '/auth/*', ({ req }) => auth.handler(req.raw))
  // Health check
  .get('/health', (c) => c.json({ status: 'ok' }))
  // Controllers
  // tbd
  // .route('/', chatController)
  // Error
  .onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json(
        {
          code: err.status,
          error: err.message,
        },
        err.status,
      );
    }

    return c.json(
      {
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        error: ReasonPhrases.INTERNAL_SERVER_ERROR,
      },
      StatusCodes.INTERNAL_SERVER_ERROR,
    );
  });

// showRoutes(app, {
//   verbose: true,
//   colorize: true,
// });

export type AppType = typeof app;
