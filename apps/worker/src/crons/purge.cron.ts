import { logger } from '@repo/logger';
import { purgeExpiredDeletions } from '@repo/media';

// Hard-deletes organizations and users whose 30 day recovery window has passed.
export async function purgeProcessor() {
  logger.info('Running purge cron job');

  const { organizationsPurged, usersPurged, failures } = await purgeExpiredDeletions();

  logger.info(
    `Purge cron job completed: ${organizationsPurged} organizations, ${usersPurged} users, ${failures} failures`,
  );
}
