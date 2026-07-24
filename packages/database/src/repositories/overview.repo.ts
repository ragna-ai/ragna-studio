import type { WorkflowRunStatus } from '@repo/workflow';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import type { TaskPriority, TaskStatus } from '../schema';
import { task } from '../schema';

// The only statuses the tasks card shows (docs/home/prd.md, "Task
// statuses"): the overview is about work needing attention, so done,
// canceled, and the potentially large backlog stay out.
const OVERVIEW_TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_review'];

// Home overview (docs/home/prd.md): small, purpose-built reads for the home
// page's dashboard cards. Distinct from the paginated list functions in
// task.repo.ts/chat.repo.ts/workflow.repo.ts/agent.repo.ts/document.repo.ts,
// which carry pagination/filter machinery the overview doesn't need.

export type RecentTask = {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  updatedAt: Date;
};

/**
 * Latest tasks for the tasks card, newest first. Only todo, in-progress,
 * and in-review tasks are included (docs/home/prd.md, "Task statuses").
 */
export async function getRecentTasksByWorkspaceId({
  workspaceId,
  limit,
}: {
  workspaceId: string;
  limit: number;
}): Promise<RecentTask[]> {
  return db.query.task.findMany({
    columns: {
      id: true,
      number: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      updatedAt: true,
    },
    where: { workspaceId, status: { in: OVERVIEW_TASK_STATUSES } },
    orderBy: (t, { desc }) => desc(t.updatedAt),
    limit,
  });
}

/**
 * Workspace task total for the tasks card. Counts only todo, in-progress,
 * and in-review tasks, the same rule `getRecentTasksByWorkspaceId` applies
 * to its list (docs/home/prd.md, "Task statuses").
 */
export async function getActiveTaskCountByWorkspaceId({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<number> {
  return db.$count(
    task,
    and(eq(task.workspaceId, workspaceId), inArray(task.status, OVERVIEW_TASK_STATUSES)),
  );
}

export type RecentChat = {
  id: string;
  title: string;
  updatedAt: Date;
  agent: { name: string };
};

/**
 * Latest chats for the chats card, newest first, with the agent name for
 * display (docs/home/prd.md, "Chats" DTO notes).
 */
export async function getRecentChatsByWorkspaceId({
  workspaceId,
  limit,
}: {
  workspaceId: string;
  limit: number;
}): Promise<RecentChat[]> {
  return db.query.chat.findMany({
    columns: { id: true, title: true, updatedAt: true },
    with: { agent: { columns: { name: true } } },
    where: { workspaceId },
    orderBy: (t, { desc }) => desc(t.updatedAt),
    limit,
  });
}

export type RecentWorkflow = {
  id: string;
  name: string;
  updatedAt: Date;
  runs: { status: WorkflowRunStatus }[];
};

/**
 * Latest workflows for the workflows card, newest first, each with its
 * latest run's status (limit 1, `createdAt` desc; empty when the workflow
 * has never run) (docs/home/prd.md, "Workflows" DTO notes).
 */
export async function getRecentWorkflowsByWorkspaceId({
  workspaceId,
  limit,
}: {
  workspaceId: string;
  limit: number;
}): Promise<RecentWorkflow[]> {
  return db.query.workflow.findMany({
    columns: { id: true, name: true, updatedAt: true },
    with: {
      runs: {
        columns: { status: true },
        orderBy: (r, { desc }) => desc(r.createdAt),
        limit: 1,
      },
    },
    where: { workspaceId },
    orderBy: (t, { desc }) => desc(t.updatedAt),
    limit,
  });
}

export type RecentAgent = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: Date;
  aiModel: { displayName: string };
};

/**
 * Latest agents for the agents card, newest first, with the model's
 * display name (docs/home/prd.md, "Agents" DTO notes).
 */
export async function getRecentAgentsByWorkspaceId({
  workspaceId,
  limit,
}: {
  workspaceId: string;
  limit: number;
}): Promise<RecentAgent[]> {
  return db.query.agent.findMany({
    columns: { id: true, name: true, description: true, updatedAt: true },
    with: { aiModel: { columns: { displayName: true } } },
    where: { workspaceId },
    orderBy: (t, { desc }) => desc(t.updatedAt),
    limit,
  });
}

export type RecentDocument = {
  id: string;
  title: string;
  updatedAt: Date;
};

/**
 * Latest documents for the documents card, newest first
 * (docs/home/prd.md, "Documents" DTO notes).
 */
export async function getRecentDocumentsByWorkspaceId({
  workspaceId,
  limit,
}: {
  workspaceId: string;
  limit: number;
}): Promise<RecentDocument[]> {
  return db.query.document.findMany({
    columns: { id: true, title: true, updatedAt: true },
    where: { workspaceId },
    orderBy: (t, { desc }) => desc(t.updatedAt),
    limit,
  });
}
