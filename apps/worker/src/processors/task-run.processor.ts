import { config } from '@repo/config';
import { logger } from '@repo/logger';
import type { ProcessorJob, ProcessorSuccess, Worker } from '@repo/queue';
import {
  createWorker,
  RUN_TASK_JOB,
  TASK_RUNS_QUEUE,
  taskRunJobSchema,
  UnrecoverableError,
} from '@repo/queue';
import { TaskRunFailed } from '../task-runs/task-run-errors';
import { executeTaskRunAttempt } from '../task-runs/task-run.service';

const LOCK_BUFFER_MS = 5 * 60_000;
const DEFAULT_ATTEMPTS = 1;

export async function processTaskRunJob(job: ProcessorJob): Promise<ProcessorSuccess> {
  logger.info(`Processing task run jobId: ${job.id} name: ${job.name}`);

  switch (job.name) {
    case RUN_TASK_JOB: {
      const { taskRunId } = taskRunJobSchema.parse(job.data);
      // BullMQ counts an attempt only after this handler returns or throws.
      const attempt = job.attemptsMade + 1;
      const attempts = job.opts.attempts ?? DEFAULT_ATTEMPTS;

      try {
        await executeTaskRunAttempt({ taskRunId, attempt, isFinalAttempt: attempt >= attempts });
      } catch (error) {
        if (error instanceof TaskRunFailed) {
          throw new UnrecoverableError(error.message);
        }
        throw error;
      }
      break;
    }
    default: {
      throw new Error(`Unknown task run job: ${job.name}`);
    }
  }

  logger.info(`Completed task run jobId: ${job.id} name: ${job.name}`);
  return { success: true };
}

export function registerTaskRunJobProcessor(): Worker<any, any, string> {
  const taskRunWorker = createWorker({
    name: TASK_RUNS_QUEUE,
    opts: {
      concurrency: config.taskRunWorkerConcurrency,
      // A run may take up to its time limit between lock renewals' worth of silence.
      lockDuration: config.taskRunTimeLimitMinutes * 60_000 + LOCK_BUFFER_MS,
      // A stalled run would repeat its side effects, so it fails instead and the sweeper ends it.
      maxStalledCount: 0,
    },
    processor: processTaskRunJob,
  });

  taskRunWorker.on('ready', () => {
    logger.info('Task run processor is ready and listening for jobs');
  });

  return taskRunWorker;
}
