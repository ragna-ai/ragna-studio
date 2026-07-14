import { logger } from '@repo/logger';
import { addCronJob } from '@repo/queue';

import { cleanupProcessor } from './cleanup.cron';
import { staleRunsProcessor } from './stale-runs.cron';

export function registerCronJobs() {
  logger.info('Registering cron jobs...');

  addCronJob({
    name: 'cleanup',
    processor: cleanupProcessor,
    schedule: { pattern: '0 2 * * *' }, // Daily at 2 AM
  });

  addCronJob({
    name: 'stale-workflow-runs',
    processor: staleRunsProcessor,
    schedule: { pattern: '*/15 * * * *' }, // Every 15 minutes
  });

  logger.info('Cron jobs registered');
}
