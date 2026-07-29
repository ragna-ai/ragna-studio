import { config } from '@repo/config';
import { logger } from '@repo/logger';
import { setTimeout } from 'node:timers/promises';
import { app } from './app';
import { websocket } from './ws/socket';

function main() {
  logger.info('Starting API server...');

  const port = config.apiPort;
  // idleTimeout: 0 disables Bun's default 10s idle timeout, since we have streaming AI/tool responses
  const server = Bun.serve({
    port,
    fetch: app.fetch,
    idleTimeout: 0,
    websocket: {
      ...websocket,
      // ws.publish() excludes the sending socket by default. Every WS
      // publish in this app goes through the shared channel.service helper,
      // and the tab that sent a `message` frame must also receive its
      // `chunk`/`done` frames (multi-tab sync), so flip this on globally
      // instead of special-casing the sender in that helper.
      publishToSelf: true,
    },
  });

  logger.info(`API server listening on http://localhost:${port}`);

  return server;
}

async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  if (server) {
    // server.stop() waits for open connections (WS, streaming responses) to
    // close on their own, which can hang forever. Racing it against a
    // timeout is required: calling server.stop(true) later does NOT resolve
    // an already-pending server.stop() promise, so awaiting both in sequence
    // still hangs.
    await Promise.race([server.stop(), setTimeout(2000)]);
    await server.stop(true);
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
