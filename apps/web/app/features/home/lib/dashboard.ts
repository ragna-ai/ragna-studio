import type { WorkflowRunStatus } from '@repo/workflow';
import type { StatusPillTone } from '~/components/StatusPill.vue';
import type {
  HomeOverviewCalendarTaskItem,
  HomeOverviewTaskItem,
} from '~/features/home/types';

export type AgentTone = 'sea' | 'sage' | 'ochre' | 'clay';

const AGENT_TONES: AgentTone[] = ['sea', 'sage', 'ochre', 'clay'];

export const AGENT_TONE_CLASS: Record<AgentTone, string> = {
  sea: 'bg-id-sea-bg text-id-sea-fg',
  sage: 'bg-id-sage-bg text-id-sage-fg',
  ochre: 'bg-id-ochre-bg text-id-ochre-fg',
  clay: 'bg-id-clay-bg text-id-clay-fg',
};

export const WORKFLOW_STATUS_TONE: Record<WorkflowRunStatus, StatusPillTone> = {
  completed: 'ok',
  running: 'agent',
  pending: 'neutral',
  suspended: 'warn',
  failed: 'danger',
  cancelled: 'neutral',
};

export const WORKFLOW_STATUS_LABEL_KEY: Record<WorkflowRunStatus, string> = {
  completed: 'home.dashboard.workflows.status.completed',
  running: 'home.dashboard.workflows.status.running',
  pending: 'home.dashboard.workflows.status.pending',
  suspended: 'home.dashboard.workflows.status.suspended',
  failed: 'home.dashboard.workflows.status.failed',
  cancelled: 'home.dashboard.workflows.status.cancelled',
};

export function agentTone(agentId: string): AgentTone {
  let hash = 0;
  for (const char of agentId) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return AGENT_TONES[hash % AGENT_TONES.length] ?? 'sea';
}

export function startOfDay(date: Date): Date {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export function sortByDueDate(
  tasks: HomeOverviewTaskItem[],
): HomeOverviewTaskItem[] {
  return [...tasks].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });
}

export function tasksDueOn(
  tasks: HomeOverviewCalendarTaskItem[],
  day: Date,
): HomeOverviewCalendarTaskItem[] {
  return tasks
    .filter((task) => task.dueDate && isSameDay(new Date(task.dueDate), day))
    .sort(
      (a, b) =>
        new Date(a.dueDate ?? 0).getTime() - new Date(b.dueDate ?? 0).getTime(),
    );
}

export function hasTimeOfDay(isoDate: string): boolean {
  const date = new Date(isoDate);
  return date.getHours() !== 0 || date.getMinutes() !== 0;
}
