import type { AgentMarkTone } from '@repo/ai/client';
import type {
  TaskRun,
  TaskRunStatus,
  TaskWithBoardInfo,
} from '~/features/task/types';

export const TASK_RUN_POLL_INTERVAL_MS = 5000;

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

export function isTaskRunActive(status: TaskRunStatus): boolean {
  return status === 'queued' || status === 'running';
}

export function hasActiveTaskRun(
  tasks: readonly Pick<TaskWithBoardInfo, 'activeRun'>[],
): boolean {
  return tasks.some((task) => task.activeRun !== null);
}

/** Poll interval for a query that holds an active run, or false to stop polling. */
export function taskRunPollInterval(isRunActive: boolean): number | false {
  return isRunActive ? TASK_RUN_POLL_INTERVAL_MS : false;
}

export const TASK_RUN_STATUS_TONE: Record<
  TaskRunStatus,
  'neutral' | AgentMarkTone
> = {
  queued: 'neutral',
  running: 'sea',
  succeeded: 'sage',
  failed: 'rose',
  canceled: 'stone',
};

/** "2 min 5 s" style length of a run, or null while it has not started. */
export function formatRunDuration(
  run: TaskRun,
  now = Date.now(),
): string | null {
  if (!run.startedAt) {
    return null;
  }
  const end = run.finishedAt ? new Date(run.finishedAt).getTime() : now;
  const totalSeconds = Math.max(
    0,
    Math.round((end - new Date(run.startedAt).getTime()) / MS_PER_SECOND),
  );
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return minutes > 0 ? `${minutes} min ${seconds} s` : `${seconds} s`;
}
