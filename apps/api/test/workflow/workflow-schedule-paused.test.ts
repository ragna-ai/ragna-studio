import { db, sql } from '@repo/database';
import { user as userTable, workflow, workspaceMember } from '@repo/database/schema';
import {
  seedAuthenticatedUser,
  seedOrganizationMember,
  truncateAllTables,
  type SeededAuthenticatedUser,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { insertWorkspace, insertWorkspaceMember } from '../workspace/workspace-access-fixtures';

// A schedule is paused when its author can no longer open the workflow's workspace.

const definitionSchema = z.strictObject({
  nodes: z.array(z.unknown()),
  edges: z.array(z.unknown()),
});

const workflowListItemSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  publishedDefinition: definitionSchema.nullable(),
  scheduleCron: z.string().nullable(),
  scheduleTimezone: z.string().nullable(),
  schedulePaused: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const workflowSchema = z.strictObject({
  id: z.string(),
  workspaceId: z.string(),
  userId: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  definition: definitionSchema,
  publishedDefinition: definitionSchema.nullable(),
  scheduleCron: z.string().nullable(),
  scheduleTimezone: z.string().nullable(),
  schedulePaused: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

interface Team {
  organizationId: string;
  owner: SeededAuthenticatedUser;
  author: SeededAuthenticatedUser;
}

async function seedTeam(): Promise<Team> {
  const owner = await seedAuthenticatedUser();
  const membership = await db.query.organizationMember.findFirst({
    where: { userId: owner.userId },
  });
  const organizationId = membership?.organizationId ?? '';
  const author = await seedOrganizationMember({ organizationId, role: 'member' });
  return { organizationId, owner, author };
}

async function seedWorkflow({
  userId,
  workspaceId,
  scheduleCron,
}: {
  userId: string | null;
  workspaceId: string;
  scheduleCron: string | null;
}): Promise<string> {
  const [created] = await db
    .insert(workflow)
    .values({ userId, workspaceId, name: 'Flow', scheduleCron })
    .returning({ id: workflow.id });
  return created?.id ?? '';
}

async function getWorkflow(viewer: SeededAuthenticatedUser, workspaceId: string, id: string) {
  const response = await app.request(`/workspace/${workspaceId}/workflow/${id}`, {
    headers: { cookie: viewer.cookieHeader },
  });
  expect(response.status).toBe(StatusCodes.OK);
  return z.strictObject({ workflow: workflowSchema }).parse(await response.json()).workflow;
}

async function listWorkflows(viewer: SeededAuthenticatedUser, workspaceId: string) {
  const response = await app.request(`/workspace/${workspaceId}/workflow`, {
    headers: { cookie: viewer.cookieHeader },
  });
  expect(response.status).toBe(StatusCodes.OK);
  const body = z
    .strictObject({
      workflows: z.array(workflowListItemSchema),
      meta: z.strictObject({ totalCount: z.number() }),
    })
    .parse(await response.json());
  return body.workflows;
}

beforeEach(async () => {
  await truncateAllTables();
});

describe('schedulePaused', () => {
  test('is false for a scheduled workflow whose author can open the workspace', async () => {
    const { owner, author } = await seedTeam();
    const id = await seedWorkflow({
      userId: author.userId,
      workspaceId: owner.workspaceId,
      scheduleCron: '0 9 * * *',
    });

    expect((await getWorkflow(owner, owner.workspaceId, id)).schedulePaused).toBe(false);
    const [item] = await listWorkflows(owner, owner.workspaceId);
    expect(item?.schedulePaused).toBe(false);
  });

  test('is false without a schedule, even when the author is gone', async () => {
    const { owner } = await seedTeam();
    const id = await seedWorkflow({
      userId: null,
      workspaceId: owner.workspaceId,
      scheduleCron: null,
    });

    expect((await getWorkflow(owner, owner.workspaceId, id)).schedulePaused).toBe(false);
    const [item] = await listWorkflows(owner, owner.workspaceId);
    expect(item?.schedulePaused).toBe(false);
  });

  test('is true for a scheduled workflow with no author', async () => {
    const { owner } = await seedTeam();
    const id = await seedWorkflow({
      userId: null,
      workspaceId: owner.workspaceId,
      scheduleCron: '0 9 * * *',
    });

    expect((await getWorkflow(owner, owner.workspaceId, id)).schedulePaused).toBe(true);
    const [item] = await listWorkflows(owner, owner.workspaceId);
    expect(item?.schedulePaused).toBe(true);
  });

  test('is true once the author is soft-deleted', async () => {
    const { owner, author } = await seedTeam();
    const id = await seedWorkflow({
      userId: author.userId,
      workspaceId: owner.workspaceId,
      scheduleCron: '0 9 * * *',
    });
    await db
      .update(userTable)
      .set({ deletedAt: new Date() })
      .where(sql`${userTable.id} = ${author.userId}`);

    expect((await getWorkflow(owner, owner.workspaceId, id)).schedulePaused).toBe(true);
    const [item] = await listWorkflows(owner, owner.workspaceId);
    expect(item?.schedulePaused).toBe(true);
  });

  test('is true once the author is removed from a restricted workspace', async () => {
    const { organizationId, owner, author } = await seedTeam();
    const workspaceId = await insertWorkspace({ organizationId, visibility: 'restricted' });
    await insertWorkspaceMember({ workspaceId, userId: author.userId, role: 'editor' });
    const id = await seedWorkflow({
      userId: author.userId,
      workspaceId,
      scheduleCron: '0 9 * * *',
    });
    expect((await getWorkflow(owner, workspaceId, id)).schedulePaused).toBe(false);

    await db.delete(workspaceMember).where(sql`${workspaceMember.userId} = ${author.userId}`);

    expect((await getWorkflow(owner, workspaceId, id)).schedulePaused).toBe(true);
    const [item] = await listWorkflows(owner, workspaceId);
    expect(item?.schedulePaused).toBe(true);
  });

  test('is computed per workflow in one list', async () => {
    const { organizationId, owner, author } = await seedTeam();
    const workspaceId = await insertWorkspace({ organizationId, visibility: 'restricted' });
    await insertWorkspaceMember({ workspaceId, userId: author.userId, role: 'editor' });
    const active = await seedWorkflow({
      userId: author.userId,
      workspaceId,
      scheduleCron: '0 9 * * *',
    });
    const orphaned = await seedWorkflow({ userId: null, workspaceId, scheduleCron: '0 9 * * *' });

    const items = await listWorkflows(owner, workspaceId);

    expect(items.find((item) => item.id === active)?.schedulePaused).toBe(false);
    expect(items.find((item) => item.id === orphaned)?.schedulePaused).toBe(true);
  });
});
