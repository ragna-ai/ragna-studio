import { db, listTasksDueForReminder, sql } from '@repo/database';
import { member } from '@repo/database/schema';
import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../src/app';

async function createOverdueTask(cookieHeader: string, workspaceId: string): Promise<string> {
  const response = await app.request(`/workspace/${workspaceId}/task`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Due soon',
      dueDate: new Date(Date.now() - 86_400_000).toISOString(),
      remindDaysBeforeDue: 1,
    }),
  });
  const body = (await response.json()) as { task: { id: string } };
  return body.task.id;
}

describe('listTasksDueForReminder', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('resolves the organization owner as recipient', async () => {
    const owner = await seedAuthenticatedUser();
    const taskId = await createOverdueTask(owner.cookieHeader, owner.workspaceId);

    const dueTasks = await listTasksDueForReminder();

    expect(dueTasks).toEqual([expect.objectContaining({ taskId, ownerUserId: owner.userId })]);
  });

  test('does not notify non-owner members', async () => {
    const owner = await seedAuthenticatedUser();
    const colleague = await seedAuthenticatedUser();
    const ownerMembership = await db.query.member.findFirst({ where: { userId: owner.userId } });
    await db.insert(member).values({
      organizationId: ownerMembership?.organizationId ?? '',
      userId: colleague.userId,
      role: 'member',
      createdAt: new Date(),
    });
    await createOverdueTask(owner.cookieHeader, owner.workspaceId);

    const dueTasks = await listTasksDueForReminder();

    expect(dueTasks.map((dueTask) => dueTask.ownerUserId)).toEqual([owner.userId]);
  });

  test('resolves an owner whose role is comma-separated', async () => {
    const owner = await seedAuthenticatedUser();
    await db
      .update(member)
      .set({ role: 'owner,admin' })
      .where(sql`${member.userId} = ${owner.userId}`);
    const taskId = await createOverdueTask(owner.cookieHeader, owner.workspaceId);

    const dueTasks = await listTasksDueForReminder();

    expect(dueTasks).toEqual([expect.objectContaining({ taskId, ownerUserId: owner.userId })]);
  });
});
