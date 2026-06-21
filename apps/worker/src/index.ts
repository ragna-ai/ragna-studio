import { logger } from '@repo/logger';
import { queueHealthCheck, shutdown } from '@repo/queue';
import { registerJobProcessors } from './processors';

async function main() {
  logger.info('Starting worker process...');

  // Check Redis connection
  const isHealthy = await queueHealthCheck();
  if (!isHealthy) {
    logger.error('Redis connection failed, exiting');
    process.exit(1);
  }

  // Register job processors
  registerJobProcessors();

  // // Register and start cron jobs
  // registerCronJobs();
  // await startCronJobs();

  // logger.info('Worker ready and processing jobs');
}

async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  await shutdown();
  process.exit(0);
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

main().catch((error) => {
  logger.error('Worker startup failed:', error);
  process.exit(1);
});
