import { config } from '@repo/config';
import { logger } from '@repo/logger';
import { app } from './app';

function main() {
  logger.info('Starting API server...');

  const port = config.apiPort;
  // idleTimeout: 0 disables Bun's default 10s idle timeout, since we have streaming AI/tool responses
  const server = Bun.serve({ port, fetch: app.fetch, idleTimeout: 0 });

  logger.info(`API server listening on http://localhost:${port}`);

  return server;
}

async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  if (server) {
    await server.stop();
  }
  process.exit(0);
}

let server: ReturnType<typeof main>;

try {
  server = main();
} catch (error) {
  logger.error('API server startup failed:', error);
  process.exit(1);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
  process.exit(1);
});
