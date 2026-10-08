import type { WorkflowRunStatus } from '@repo/workflow';
import type { TaskPriority, TaskStatus } from '~/features/task/types';

// Slim projections for the home overview cards (specs/home/prd.md, "DTO
// notes"): only what each card renders, never full entity rows. Status and
// priority reuse the task feature's own unions so the existing display
// helpers (task-display.ts) apply without any casting.

/** Row shown in the Tasks overview card. Canceled tasks never appear here:
 * the API excludes them entirely (specs/home/prd.md, "Decisions"). */
export interface HomeOverviewTaskItem {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  updatedAt: string;
}

/** Row shown in the Calendar card for a selected day. Same status rule as
 * `HomeOverviewTaskItem`, plus the assigned agent for the row's avatar. */
export interface HomeOverviewCalendarTaskItem {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  assignedAgent: { id: string; name: string } | null;
}

export interface HomeOverviewChatItem {
  id: string;
  title: string;
  agentName: string;
  updatedAt: string;
}

export interface HomeOverviewWorkflowItem {
  id: string;
  name: string;
  // Null when the workflow has never run (specs/home/prd.md, "DTO notes").
  lastRunStatus: WorkflowRunStatus | null;
  updatedAt: string;
}

export interface HomeOverviewAgentItem {
  id: string;
  name: string;
  description: string;
  modelName: string;
  updatedAt: string;
}

// No folder/author joins: title and recency are enough at overview
// granularity (specs/home/prd.md, "DTO notes").
export interface HomeOverviewDocumentItem {
  id: string;
  title: string;
  updatedAt: string;
}

/** Per-section shape shared by all cards (specs/home/prd.md, "Response"):
 * latest 5 items plus the workspace-wide total. */
export interface HomeOverviewSection<TItem> {
  items: TItem[];
  total: number;
}

export interface HomeOverviewResponse {
  tasks: HomeOverviewSection<HomeOverviewTaskItem>;
  chats: HomeOverviewSection<HomeOverviewChatItem>;
  workflows: HomeOverviewSection<HomeOverviewWorkflowItem>;
  agents: HomeOverviewSection<HomeOverviewAgentItem>;
  documents: HomeOverviewSection<HomeOverviewDocumentItem>;
  // Not a section: the calendar card pages through this bounded window
  // client-side instead of paginating against a workspace total.
  calendarTasks: HomeOverviewCalendarTaskItem[];
}
