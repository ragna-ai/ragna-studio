import { getScheduledWorkflows } from '@repo/database';
import { logger } from '@repo/logger';
import {
  getQueueJobSchedulers,
  removeQueueJobScheduler,
  upsertQueueJobScheduler,
  WORKFLOW_SCHEDULE_TICK_JOB,
  WORKFLOW_SCHEDULES_QUEUE,
  workflowScheduleTickJobSchema,
} from '@repo/queue';

// Redis is treated as a cache of the DB's schedule state (workflows-scheduling.md,
// decision 3). Run once at worker startup, after processors are registered,
// so drift from a Redis flush or a failed publish sync heals without manual
// intervention: every DB schedule gets an upserted scheduler (also fixing a
// changed pattern), and every scheduler with no matching DB row is removed.
export async function reconcileSchedules(): Promise<void> {
  const [scheduledWorkflows, existingSchedulers] = await Promise.all([
    getScheduledWorkflows(),
    getQueueJobSchedulers({ queueName: WORKFLOW_SCHEDULES_QUEUE }),
  ]);

  const scheduledWorkflowIds = new Set(scheduledWorkflows.map((workflow) => workflow.id));

  for (const workflow of scheduledWorkflows) {
    await upsertQueueJobScheduler({
      queueName: WORKFLOW_SCHEDULES_QUEUE,
      schedulerId: workflow.id,
      repeat: { pattern: workflow.scheduleCron, tz: workflow.scheduleTimezone ?? undefined },
      job: {
        name: WORKFLOW_SCHEDULE_TICK_JOB,
        data: workflowScheduleTickJobSchema.parse({ workflowId: workflow.id }),
        opts: { attempts: 1, removeOnComplete: true, removeOnFail: { age: 24 * 3600 } },
      },
    });
  }

  const orphanedSchedulerIds = existingSchedulers
    .map((scheduler) => scheduler.key)
    .filter((schedulerId) => !scheduledWorkflowIds.has(schedulerId));

  for (const schedulerId of orphanedSchedulerIds) {
    await removeQueueJobScheduler({ queueName: WORKFLOW_SCHEDULES_QUEUE, schedulerId });
  }

  logger.info(
    `Workflow schedule reconciliation complete: ${scheduledWorkflows.length} upserted, ${orphanedSchedulerIds.length} removed`,
  );
}
