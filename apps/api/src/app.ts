import { auth } from '@repo/auth/server';
import { config } from '@repo/config';
import { logger } from '@repo/logger';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger as honoLogger } from 'hono/logger';
import { ReasonPhrases, StatusCodes } from 'http-status-codes';
import { agentDocumentController } from './controllers/agent-document.controller';
import { agentController } from './controllers/agent.controller';
import { aiModelController } from './controllers/aimodel.controller';
import { chatController } from './controllers/chat.controller';
import { datasetController } from './controllers/dataset.controller';
import { imageGenerateController } from './controllers/imagegen.controller';
import { notificationController } from './controllers/notification.controller';
import { socialPostController } from './controllers/social-post.controller';
import { userController } from './controllers/user.controller';
import { workflowController } from './controllers/workflow.controller';
import { workspaceController } from './controllers/workspace.controller';

// Origins allowed to call the API with credentials (cookies).
// Always include the web app origin so CORS holds even if TRUSTED_ORIGINS is empty.
const allowedOrigins = [config.appUrl, ...config.trustedOrigins];

export const app = new Hono()
  .basePath('/')
  // Logger middleware
  .use(honoLogger((message, ...rest) => logger.log(message, ...rest)))
  // Cors middleware
  .use(
    cors({
      origin: allowedOrigins,
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
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
  .route('/', userController)
  .route('/', chatController)
  .route('/', agentController)
  .route('/', agentDocumentController)
  .route('/', aiModelController)
  .route('/', imageGenerateController)
  .route('/', workflowController)
  .route('/', socialPostController)
  .route('/', notificationController)
  .route('/', workspaceController)
  .route('/', datasetController)
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

    logger.error('Unhandled error in API', err);

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
