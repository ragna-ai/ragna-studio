import { logger } from '@repo/logger';
import { registerAgentJobProcessor } from './agent.processor';
import { registerEmailJobProcessor } from './email.processor';
import { registerNotificationJobProcessor } from './notification.processor';
import { registerPostsJobProcessor } from './posts.processor';
import { registerWorkflowJobProcessor } from './workflow.processor';

export function registerJobProcessors() {
  logger.info('Registering job processors...');

  registerNotificationJobProcessor();
  registerEmailJobProcessor();
  registerPostsJobProcessor();
  registerAgentJobProcessor();
  registerWorkflowJobProcessor();
}
