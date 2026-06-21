import { logger } from '@repo/logger';
import { addCronJob } from '@repo/queue';

import { cleanupProcessor } from './cleanup.cron';

export function registerCronJobs() {
  logger.info('Registering cron jobs...');

  addCronJob({
    name: 'cleanup',
    processor: cleanupProcessor,
    schedule: { pattern: '0 2 * * *' }, // Daily at 2 AM
  });

  logger.info('Cron jobs registered');
}
