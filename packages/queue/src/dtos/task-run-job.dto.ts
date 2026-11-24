import { z } from 'zod';

export const taskRunJobSchema = z.object({
  taskRunId: z.uuidv7(),
});

export type TaskRunJobData = z.infer<typeof taskRunJobSchema>;

export const RUN_TASK_JOB = 'run-task-job';
