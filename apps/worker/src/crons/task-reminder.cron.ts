import type { TaskDueForReminder } from '@repo/database';
import { listTasksDueForReminder, markTaskReminderSent } from '@repo/database';
import { logger } from '@repo/logger';
import { enqueueNotification } from '@repo/queue';

// Fires task due-date reminders onto the notification bell (specs/tasks/prd.md,
// "Reminders"). `listTasksDueForReminder` already applies the fire-time,
// status, and fire-once filters, so this cron only has to notify and stamp.
// Best-effort per task: one failure must never block the rest of the batch,
// the same reasoning as `notifyRunFinished` in workflow.processor.ts.
export async function taskReminderProcessor() {
  logger.info('Running task reminder cron job');

  const dueTasks = await listTasksDueForReminder();

  let sentCount = 0;
  for (const dueTask of dueTasks) {
    try {
      await notifyAndMarkSent(dueTask);
      sentCount += 1;
    } catch (error) {
      logger.error(`Failed to send reminder for task ${dueTask.taskId}`, error);
    }
  }

  logger.info(`Task reminder cron job sent ${sentCount}/${dueTasks.length} reminder(s)`);
}

async function notifyAndMarkSent(dueTask: TaskDueForReminder): Promise<void> {
  await enqueueNotification({
    userId: dueTask.ownerUserId,
    type: 'task_reminder_due',
    data: {
      taskId: dueTask.taskId,
      workspaceId: dueTask.workspaceId,
      taskNumber: dueTask.taskNumber,
      taskTitle: dueTask.taskTitle,
    },
  });

  await markTaskReminderSent({ id: dueTask.taskId });
}
