import { logger } from '@repo/logger';
import { registerEmailJobProcessor } from './email.processor';
import { registerWorkflowJobProcessor } from './workflow.processor';

export function registerJobProcessors() {
  logger.info('Registering job processors...');

  // registerNotificationJobProcessor();
  registerEmailJobProcessor();
  registerWorkflowJobProcessor();
}
