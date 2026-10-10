import { db } from '@repo/database';
import { markTaskReminderSent } from '@repo/database';
import {
  queueAddMock,
  resetProviderMocks,
  seedAuthenticatedUser,
  truncateAllTables,
} from '@repo/testing';
import { NOTIFY_USER_JOB } from '@repo/queue';
import { beforeEach, describe, expect, test } from 'bun:test';
import { taskReminderProcessor } from '../../src/crons/task-reminder.cron';
import { daysFromNow, seedReminderTask } from '../support/crons-fixtures';

async function reminderSentAt(taskId: string): Promise<Date | null | undefined> {
  const found = await db.query.task.findFirst({ where: { id: taskId } });
  return found?.reminderSentAt;
}

describe('task reminder cron', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('notifies the organization owner of a due task and stamps it', async () => {
    const { userId, workspaceId } = await seedAuthenticatedUser();
    const dueTask = await seedReminderTask({
      workspaceId,
      dueDate: daysFromNow(1),
      remindDaysBeforeDue: 2,
    });

    await taskReminderProcessor();

    expect(queueAddMock).toHaveBeenCalledTimes(1);
    expect(queueAddMock).toHaveBeenCalledWith(NOTIFY_USER_JOB, {
      userId,
      type: 'task_reminder_due',
      data: {
        taskId: dueTask.id,
        workspaceId,
        taskNumber: dueTask.number,
        taskTitle: dueTask.title,
      },
    });
    expect(await reminderSentAt(dueTask.id)).toBeInstanceOf(Date);
  });

  test('skips a task whose reminder was already sent', async () => {
    const { workspaceId } = await seedAuthenticatedUser();
    const sentTask = await seedReminderTask({
      workspaceId,
      dueDate: daysFromNow(1),
      remindDaysBeforeDue: 2,
    });
    await markTaskReminderSent({ id: sentTask.id });

    await taskReminderProcessor();

    expect(queueAddMock).not.toHaveBeenCalled();
  });

  test('skips tasks whose fire time has not come and finished tasks', async () => {
    const { workspaceId } = await seedAuthenticatedUser();
    await seedReminderTask({ workspaceId, dueDate: daysFromNow(10), remindDaysBeforeDue: 1 });
    await seedReminderTask({
      workspaceId,
      dueDate: daysFromNow(1),
      remindDaysBeforeDue: 2,
      status: 'done',
    });

    await taskReminderProcessor();

    expect(queueAddMock).not.toHaveBeenCalled();
  });

  test('one failing enqueue does not block the other reminders', async () => {
    const { workspaceId } = await seedAuthenticatedUser();
    const firstTask = await seedReminderTask({
      workspaceId,
      dueDate: daysFromNow(1),
      remindDaysBeforeDue: 2,
    });
    const secondTask = await seedReminderTask({
      workspaceId,
      dueDate: daysFromNow(1),
      remindDaysBeforeDue: 2,
    });
    queueAddMock.mockRejectedValueOnce(new Error('redis down'));

    await taskReminderProcessor();

    expect(queueAddMock).toHaveBeenCalledTimes(2);
    const stamps = [await reminderSentAt(firstTask.id), await reminderSentAt(secondTask.id)];
    expect(stamps.filter((stamp) => stamp instanceof Date)).toHaveLength(1);
  });
});
