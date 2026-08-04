import type { TaskPriority, TaskStatus } from '@repo/database';
import {
  getActiveTaskCountByWorkspaceId,
  getAgentCountByWorkspaceId,
  getChatCountByWorkspaceId,
  getDocumentCountByWorkspaceId,
  getRecentAgentsByWorkspaceId,
  getRecentChatsByWorkspaceId,
  getRecentDocumentsByWorkspaceId,
  getRecentTasksByWorkspaceId,
  getRecentWorkflowsByWorkspaceId,
  getTasksByWorkspaceIdAndDueDateRange,
  getWorkflowCountByWorkspaceId,
} from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import type { WorkflowRunStatus } from '@repo/workflow';
import { InternalServerErrorException } from '../exceptions';

// Home overview cards (docs/home/prd.md): one aggregated read per workspace,
// five entities in parallel. Slim, card-only DTOs, never full rows. Data
// access lives in packages/database/src/repositories/overview.repo.ts (plus
// the existing per-entity count functions); this file only orchestrates the
// parallel reads and flattens each repo row into its card DTO, the same
// repo/service split chat.repo.ts/chat.service.ts already use.

const RECENT_ITEM_LIMIT = 5;

// Calendar window (docs/home/prd.md, "Calendar card"): a fixed range instead
// of an open-ended date param, so the calendar card stays a single read
// inside this one aggregated overview fetch. The day strip's prev/next
// arrows page within this window on the client; they don't trigger a
// refetch.
const CALENDAR_DAYS_BEFORE = 7;
const CALENDAR_DAYS_AFTER = 21;

function getCalendarWindow(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - CALENDAR_DAYS_BEFORE);

  const end = new Date();
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() + CALENDAR_DAYS_AFTER);

  return { start, end };
}

export interface OverviewTaskItem {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  updatedAt: Date;
}

export interface OverviewCalendarTaskItem {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  assignedAgent: { id: string; name: string } | null;
}

export interface OverviewChatItem {
  id: string;
  title: string;
  agentName: string;
  updatedAt: Date;
}

export interface OverviewWorkflowItem {
  id: string;
  name: string;
  lastRunStatus: WorkflowRunStatus | null;
  updatedAt: Date;
}

export interface OverviewAgentItem {
  id: string;
  name: string;
  description: string | null;
  modelName: string;
  updatedAt: Date;
}

export interface OverviewDocumentItem {
  id: string;
  title: string;
  updatedAt: Date;
}

interface OverviewSection<TItem> {
  items: TItem[];
  total: number;
}

export interface WorkspaceOverview {
  tasks: OverviewSection<OverviewTaskItem>;
  chats: OverviewSection<OverviewChatItem>;
  workflows: OverviewSection<OverviewWorkflowItem>;
  agents: OverviewSection<OverviewAgentItem>;
  documents: OverviewSection<OverviewDocumentItem>;
  // Not a section: the calendar card pages through this bounded window
  // client-side instead of paginating against a workspace total.
  calendarTasks: OverviewCalendarTaskItem[];
}

/**
 * [GET] /workspace/:workspaceId/overview
 * One round trip for the home page's overview cards: tasks, chats,
 * workflows, agents, documents (each capped at 5 recent items plus a
 * workspace total), and the calendar's tasks due inside a fixed window
 * around today (docs/home/prd.md).
 */
export async function getWorkspaceOverview(workspaceId: string): Promise<WorkspaceOverview> {
  const { start, end } = getCalendarWindow();

  const { error, data } = await tryCatch(() =>
    Promise.all([
      getRecentTasksByWorkspaceId({ workspaceId, limit: RECENT_ITEM_LIMIT }),
      getActiveTaskCountByWorkspaceId({ workspaceId }),
      getRecentChatsByWorkspaceId({ workspaceId, limit: RECENT_ITEM_LIMIT }),
      getChatCountByWorkspaceId({ workspaceId }),
      getRecentWorkflowsByWorkspaceId({ workspaceId, limit: RECENT_ITEM_LIMIT }),
      getWorkflowCountByWorkspaceId({ workspaceId }),
      getRecentAgentsByWorkspaceId({ workspaceId, limit: RECENT_ITEM_LIMIT }),
      getAgentCountByWorkspaceId({ workspaceId }),
      getRecentDocumentsByWorkspaceId({ workspaceId, limit: RECENT_ITEM_LIMIT }),
      getDocumentCountByWorkspaceId({ workspaceId }),
      getTasksByWorkspaceIdAndDueDateRange({ workspaceId, start, end }),
    ]),
  );

  if (error !== null || !data) {
    logger.error('Failed to load workspace overview', error);
    throw new InternalServerErrorException('Failed to load workspace overview');
  }

  const [
    taskRows,
    taskTotal,
    chatRows,
    chatTotal,
    workflowRows,
    workflowTotal,
    agentRows,
    agentTotal,
    documentRows,
    documentTotal,
    calendarTaskRows,
  ] = data;

  return {
    tasks: {
      items: taskRows,
      total: taskTotal,
    },
    chats: {
      items: chatRows.map((chatRecord) => ({
        id: chatRecord.id,
        title: chatRecord.title,
        agentName: chatRecord.agent.name,
        updatedAt: chatRecord.updatedAt,
      })),
      total: chatTotal,
    },
    workflows: {
      items: workflowRows.map((workflowRecord) => ({
        id: workflowRecord.id,
        name: workflowRecord.name,
        lastRunStatus: workflowRecord.runs[0]?.status ?? null,
        updatedAt: workflowRecord.updatedAt,
      })),
      total: workflowTotal,
    },
    agents: {
      items: agentRows.map((agentRecord) => ({
        id: agentRecord.id,
        name: agentRecord.name,
        description: agentRecord.description,
        modelName: agentRecord.aiModel.displayName,
        updatedAt: agentRecord.updatedAt,
      })),
      total: agentTotal,
    },
    documents: {
      items: documentRows,
      total: documentTotal,
    },
    calendarTasks: calendarTaskRows,
  };
}
