import { z } from 'zod';

export const workflowScheduleTickJobSchema = z.object({
  workflowId: z.uuidv7(),
});

export type WorkflowScheduleTickJobData = z.infer<typeof workflowScheduleTickJobSchema>;

export const WORKFLOW_SCHEDULE_TICK_JOB = 'workflow-schedule-tick-job';
