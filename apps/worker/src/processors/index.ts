import { logger } from '@repo/logger';
import { registerAgentContextDocumentJobProcessor } from './agent-context-document.processor';
import { registerSendEmailJobProcessor } from './email.processor';
// Temporarily disabled: import { registerEmailClassifyJobProcessor } from './email-classify.processor';
// Temporarily disabled: import { registerEmailDraftJobProcessor } from './email-draft.processor';
// Temporarily disabled: import { registerEmailSyncJobProcessor } from './email-sync.processor';
import { registerGenImagesJobProcessor } from './gen-images.processor';
import { registerGenVideoJobProcessor } from './gen-video.processor';
import { registerNotificationJobProcessor } from './notification.processor';
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
  // Temporarily disabled: registerEmailSyncJobProcessor();
  // Temporarily disabled: registerEmailClassifyJobProcessor();
  // Temporarily disabled: registerEmailDraftJobProcessor();
}
