import { db, resolveScheduledRunUserId, sql } from '@repo/database';
import { member as memberTable, user as userTable, workflow } from '@repo/database/schema';
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

// Runs carry the user they execute as: the member who clicked run, or for a
// schedule tick the workflow author, falling back to the organization owner.

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
  owner: SeededAuthenticatedUser;
  member: SeededAuthenticatedUser;
}

async function seedTeam(): Promise<Team> {
  const owner = await seedAuthenticatedUser();
  const membership = await db.query.member.findFirst({ where: { userId: owner.userId } });
  const member = await seedOrganizationMember({
    organizationId: membership?.organizationId ?? '',
    role: 'member',
  });
  return { owner, member };
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
  test('picks the workflow author while they exist', async () => {
    const { owner, member } = await seedTeam();
    const workflowId = await seedWorkflowAuthoredBy(member, owner.workspaceId);

    expect(await resolveScheduledRunUserId({ workflowId })).toBe(member.userId);
  });

  test('falls back to the organization owner once the author is gone', async () => {
    const { owner, member } = await seedTeam();
    const workflowId = await seedWorkflowAuthoredBy(member, owner.workspaceId);

    await deleteSeededUser({ userId: member.userId });

    expect(await resolveScheduledRunUserId({ workflowId })).toBe(owner.userId);
  });

  test('falls back to the organization owner once the author is soft-deleted', async () => {
    const { owner, member } = await seedTeam();
    const workflowId = await seedWorkflowAuthoredBy(member, owner.workspaceId);

    await db
      .update(userTable)
      .set({ deletedAt: new Date() })
      .where(sql`${userTable.id} = ${member.userId}`);

    expect(await resolveScheduledRunUserId({ workflowId })).toBe(owner.userId);
  });

  test('finds an owner whose role is a comma-separated list', async () => {
    const { owner, member } = await seedTeam();
    const workflowId = await seedWorkflowAuthoredBy(member, owner.workspaceId);
    await db
      .update(memberTable)
      .set({ role: 'owner,admin' })
      .where(sql`${memberTable.userId} = ${owner.userId}`);
    await deleteSeededUser({ userId: member.userId });

    expect(await resolveScheduledRunUserId({ workflowId })).toBe(owner.userId);
  });

  test('is null for a workflow that does not exist', async () => {
    expect(await resolveScheduledRunUserId({ workflowId: Bun.randomUUIDv7() })).toBeNull();
  });
});
