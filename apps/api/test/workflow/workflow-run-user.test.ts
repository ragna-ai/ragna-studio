import { db, resolveScheduledRunUserId, sql } from '@repo/database';
import { user as userTable, workflow, workspaceMember } from '@repo/database/schema';
import {
  deleteSeededUser,
  seedAuthenticatedUser,
  seedCreditAccount,
  seedOrganizationMember,
  truncateAllTables,
  type SeededAuthenticatedUser,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import type { WorkflowDefinition } from '@repo/workflow';
import * as z from 'zod';
import { app } from '../../src/app';
import { insertWorkspace, insertWorkspaceMember } from '../workspace/workspace-access-fixtures';

// Runs carry the user they execute as: the member who clicked run, or for a
// schedule tick the workflow author while they can still open the workspace.

const MANUAL_TRIGGER_DEFINITION: WorkflowDefinition = {
  nodes: [
    {
      id: 'trigger-1',
      type: 'trigger',
      position: { x: 0, y: 0 },
      data: { label: 'Start', config: { kind: 'manual' } },
    },
  ],
  edges: [],
};

interface Team {
  organizationId: string;
  owner: SeededAuthenticatedUser;
  member: SeededAuthenticatedUser;
}

async function seedTeam(): Promise<Team> {
  const owner = await seedAuthenticatedUser();
  const membership = await db.query.organizationMember.findFirst({
    where: { userId: owner.userId },
  });
  const organizationId = membership?.organizationId ?? '';
  const member = await seedOrganizationMember({ organizationId, role: 'member' });
  return { organizationId, owner, member };
}

async function seedRestrictedWorkspaceWithMember(
  organizationId: string,
  member: SeededAuthenticatedUser,
): Promise<string> {
  const workspaceId = await insertWorkspace({ organizationId, visibility: 'restricted' });
  await insertWorkspaceMember({ workspaceId, userId: member.userId, role: 'editor' });
  return workspaceId;
}

async function softDeleteUser(userId: string) {
  await db
    .update(userTable)
    .set({ deletedAt: new Date() })
    .where(sql`${userTable.id} = ${userId}`);
}

async function seedWorkflowAuthoredBy(user: SeededAuthenticatedUser, workspaceId: string) {
  const [created] = await db
    .insert(workflow)
    .values({
      userId: user.userId,
      workspaceId,
      name: 'Flow',
      definition: MANUAL_TRIGGER_DEFINITION,
      publishedDefinition: MANUAL_TRIGGER_DEFINITION,
    })
    .returning({ id: workflow.id });
  return created?.id ?? '';
}

beforeEach(async () => {
  await truncateAllTables();
});

describe('POST /workspace/:workspaceId/workflow/:workflowId/run', () => {
  test('records the member who clicked run, not the author', async () => {
    const { owner, member } = await seedTeam();
    await seedCreditAccount({ userId: owner.userId, balanceMicroCredits: 10_000_000n });
    const workflowId = await seedWorkflowAuthoredBy(owner, owner.workspaceId);

    const response = await app.request(
      `/workspace/${member.workspaceId}/workflow/${workflowId}/run`,
      {
        method: 'POST',
        headers: { cookie: member.cookieHeader, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      },
    );

    expect(response.status).toBe(StatusCodes.OK);
    const { run } = z
      .object({ run: z.object({ id: z.string() }).loose() })
      .parse(await response.json());
    const stored = await db.query.workflowRun.findFirst({ where: { id: run.id } });
    expect(stored?.triggeredByUserId).toBe(member.userId);
    expect(stored?.triggeredBy).toBe('manual');
  });
});

describe('resolveScheduledRunUserId', () => {
  test('picks the workflow author while they can open the workspace', async () => {
    const { owner, member } = await seedTeam();
    const workflowId = await seedWorkflowAuthoredBy(member, owner.workspaceId);

    expect(await resolveScheduledRunUserId({ workflowId })).toBe(member.userId);
  });

  test('is null once the author is gone', async () => {
    const { owner, member } = await seedTeam();
    const workflowId = await seedWorkflowAuthoredBy(member, owner.workspaceId);

    await deleteSeededUser({ userId: member.userId });

    expect(await resolveScheduledRunUserId({ workflowId })).toBeNull();
  });

  test('is null once the author is soft-deleted', async () => {
    const { owner, member } = await seedTeam();
    const workflowId = await seedWorkflowAuthoredBy(member, owner.workspaceId);

    await softDeleteUser(member.userId);

    expect(await resolveScheduledRunUserId({ workflowId })).toBeNull();
  });

  test('is null once the author is removed from a restricted workspace', async () => {
    const { organizationId, member } = await seedTeam();
    const workspaceId = await seedRestrictedWorkspaceWithMember(organizationId, member);
    const workflowId = await seedWorkflowAuthoredBy(member, workspaceId);
    expect(await resolveScheduledRunUserId({ workflowId })).toBe(member.userId);

    await db.delete(workspaceMember).where(sql`${workspaceMember.userId} = ${member.userId}`);

    expect(await resolveScheduledRunUserId({ workflowId })).toBeNull();
  });

  test('is null for the workflow of a personal workspace whose user is soft-deleted', async () => {
    const { member } = await seedTeam();
    const workflowId = await seedWorkflowAuthoredBy(member, member.personalWorkspaceId);
    expect(await resolveScheduledRunUserId({ workflowId })).toBe(member.userId);

    await softDeleteUser(member.userId);

    expect(await resolveScheduledRunUserId({ workflowId })).toBeNull();
  });

  test('is null for a workflow that does not exist', async () => {
    expect(await resolveScheduledRunUserId({ workflowId: Bun.randomUUIDv7() })).toBeNull();
  });
});
