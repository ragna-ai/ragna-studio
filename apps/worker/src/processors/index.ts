import { logger } from '@repo/logger';
import { registerAgentContextDocumentJobProcessor } from './agent-context-document.processor';
import { registerSendEmailJobProcessor } from './email.processor';
import { registerEmailClassifyJobProcessor } from './email-classify.processor';
import { registerEmailDraftJobProcessor } from './email-draft.processor';
import { registerEmailSyncJobProcessor } from './email-sync.processor';
import { registerGenImagesJobProcessor } from './gen-images.processor';
import { registerGenVideoJobProcessor } from './gen-video.processor';
import { registerNotificationJobProcessor } from './notification.processor';
import { registerPurgeJobProcessor } from './purge.processor';
import { registerWorkflowScheduleJobProcessor } from './workflow-schedule.processor';
import { registerWorkflowJobProcessor } from './workflow.processor';

export function registerJobProcessors() {
  logger.info('Registering job processors...');

  registerNotificationJobProcessor();
  registerSendEmailJobProcessor();
  registerWorkflowJobProcessor();
  registerWorkflowScheduleJobProcessor();
  registerAgentContextDocumentJobProcessor();
  registerGenVideoJobProcessor();
  registerGenImagesJobProcessor();
  registerEmailSyncJobProcessor();
  registerEmailClassifyJobProcessor();
  registerEmailDraftJobProcessor();
  registerPurgeJobProcessor();
}
