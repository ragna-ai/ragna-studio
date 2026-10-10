import { createTask, createWorkflow, db } from '@repo/database';
import {
  emailAccount,
  notification,
  session,
  verification,
  workflowRun,
  type EmailAccount,
  type Task,
  type WorkflowRun,
} from '@repo/database/schema';

export async function listSessionIds(): Promise<Set<string>> {
  const rows = await db.query.session.findMany();
  return new Set(rows.map((row) => row.id));
}

export async function listVerificationIds(): Promise<Set<string>> {
  const rows = await db.query.verification.findMany();
  return new Set(rows.map((row) => row.id));
}

export async function listNotificationIds(): Promise<Set<string>> {
  const rows = await db.query.notification.findMany();
  return new Set(rows.map((row) => row.id));
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * HOUR_MS);
}

export function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY_MS);
}

export async function seedSession({
  userId,
  expiresAt,
}: {
  userId: string;
  expiresAt: Date;
}): Promise<string> {
  const now = new Date();
  const [created] = await db
    .insert(session)
    .values({
      userId,
      token: `token-${crypto.randomUUID()}`,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: session.id });
  if (!created) throw new Error('Failed to seed session');
  return created.id;
}

export async function seedVerification({ expiresAt }: { expiresAt: Date }): Promise<string> {
  const now = new Date();
  const [created] = await db
    .insert(verification)
    .values({
      identifier: `identifier-${crypto.randomUUID()}`,
      value: 'value',
      expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: verification.id });
  if (!created) throw new Error('Failed to seed verification');
  return created.id;
}

export async function seedNotification({
  userId,
  readAt,
}: {
  userId: string;
  readAt: Date | null;
}): Promise<string> {
  const [created] = await db
    .insert(notification)
    .values({ userId, type: 'test', readAt })
    .returning({ id: notification.id });
  if (!created) throw new Error('Failed to seed notification');
  return created.id;
}

export interface SeedWorkflowRunParams {
  userId: string;
  workspaceId: string;
  status: WorkflowRun['status'];
  createdAt: Date;
  startedAt?: Date;
}

export async function seedWorkflowRun({
  userId,
  workspaceId,
  status,
  createdAt,
  startedAt,
}: SeedWorkflowRunParams): Promise<string> {
  const definition = { nodes: [], edges: [] };
  const workflow = await createWorkflow({
    userId,
    workspaceId,
    name: `workflow-${crypto.randomUUID()}`,
    definition,
  });
  const [created] = await db
    .insert(workflowRun)
    .values({ workflowId: workflow.id, status, definition, createdAt, startedAt })
    .returning({ id: workflowRun.id });
  if (!created) throw new Error('Failed to seed workflow run');
  return created.id;
}

export interface SeedReminderTaskParams {
  workspaceId: string;
  dueDate: Date;
  remindDaysBeforeDue: number;
  status?: Task['status'];
}

export function seedReminderTask({
  workspaceId,
  dueDate,
  remindDaysBeforeDue,
  status,
}: SeedReminderTaskParams): Promise<Task> {
  return createTask({
    workspaceId,
    title: `Task ${crypto.randomUUID()}`,
    dueDate,
    remindDaysBeforeDue,
    status,
  });
}

export async function seedEmailAccount({
  userId,
  syncState = 'idle',
}: {
  userId: string;
  syncState?: EmailAccount['syncState'];
}): Promise<EmailAccount> {
  const [created] = await db
    .insert(emailAccount)
    .values({ userId, provider: 'gmail', email: `${crypto.randomUUID()}@example.com`, syncState })
    .returning();
  if (!created) throw new Error('Failed to seed email account');
  return created;
}
