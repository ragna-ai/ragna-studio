import { z } from 'zod';

export const workflowRunJobSchema = z.object({
  runId: z.uuidv7(),
});

export type WorkflowRunJobData = z.infer<typeof workflowRunJobSchema>;

export const WORKFLOW_RUN_JOB = 'workflow-run-job';
