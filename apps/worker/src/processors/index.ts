import { logger } from '@repo/logger';
import { registerAgentDocumentJobProcessor } from './agent-document.processor';
import { registerEmailJobProcessor } from './email.processor';
import { registerNotificationJobProcessor } from './notification.processor';
import { registerWorkflowScheduleJobProcessor } from './workflow-schedule.processor';
import { registerWorkflowJobProcessor } from './workflow.processor';

export function registerJobProcessors() {
  logger.info('Registering job processors...');

  registerNotificationJobProcessor();
  registerEmailJobProcessor();
  registerWorkflowJobProcessor();
  registerWorkflowScheduleJobProcessor();
  registerAgentDocumentJobProcessor();
}
