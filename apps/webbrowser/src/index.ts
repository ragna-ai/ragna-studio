import { config } from '@repo/config';
import { logger } from '@repo/logger';
import { app } from './app';
import { closeBrowser } from './services/browser.service';

function main() {
  logger.info('Starting webbrowser server...');

  const port = config.webBrowserPort;
  const server = Bun.serve({
    port,
    fetch: app.fetch,
    // Bun's default 10s idle timeout kills the connection before a normal
    // scrape finishes (navigation alone can take up to BROWSER_NAVIGATION_TIMEOUT,
    // plus queueing behind the concurrency semaphore), so disable it.
    idleTimeout: 0,
  });

  logger.info(`Webbrowser server listening on http://localhost:${port}`);

  return server;
}

async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  if (server) {
    await server.stop();
  }
  await closeBrowser();
  process.exit(0);
}

let server: ReturnType<typeof main>;

try {
  server = main();
} catch (error) {
  logger.error('Webbrowser server startup failed:', error);
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
