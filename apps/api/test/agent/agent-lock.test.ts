import { db, getApprovedAgentVersion } from '@repo/database';
import { agentVersion } from '@repo/database/schema';
import { truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import type { SeededUser } from '../workspace/workspace-access-fixtures';
import {
  agentRoutes,
  createAgent,
  expectProblem,
  lockResponseSchema,
  seedLockTeam,
  versionSchema,
  type LockTeam,
} from './agent-lock-fixtures';

const versionListSchema = z.strictObject({ versions: z.array(versionSchema) });

async function seedLockedScene() {
  const team = await seedLockTeam();
  const agentId = await createAgent(team.editor, { aiModelId: team.aiModelId });
  const routes = agentRoutes({ workspaceId: team.workspaceId, agentId });
  return { team, agentId, routes };
}

async function lockAs(routes: ReturnType<typeof agentRoutes>, user: SeededUser) {
  const response = await routes.lock(user);
  expect(response.status).toBe(StatusCodes.OK);
}

async function approveAs(routes: ReturnType<typeof agentRoutes>, user: SeededUser) {
  const response = await routes.approve(user);
  expect(response.status).toBe(StatusCodes.OK);
}

describe('locking an agent', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('a workspace editor locks an agent and is shown as the locker of version one', async () => {
    const { team, routes } = await seedLockedScene();

    const response = await routes.lock(team.editor);

    expect(response.status).toBe(StatusCodes.OK);
    const { lock } = lockResponseSchema.parse(await response.json());
    expect(lock?.versionNumber).toBe(1);
    expect(lock?.lockedBy?.id).toBe(team.editor.userId);
    expect(lock?.approval).toBeNull();
    expect((await routes.detail(team.editor)).lock).toEqual(lock);
  });

  test('locking an already locked agent is refused', async () => {
    const { team, routes } = await seedLockedScene();
    await lockAs(routes, team.editor);

    const response = await routes.lock(team.editor);

    await expectProblem(response, StatusCodes.CONFLICT, 'agent-already-locked');
  });
});

describe('approving an agent for unattended runs', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('a manager approves an unlocked agent, which locks and approves it in one step', async () => {
    const { team, routes } = await seedLockedScene();

    const response = await routes.approve(team.manager);

    expect(response.status).toBe(StatusCodes.OK);
    const { lock } = lockResponseSchema.parse(await response.json());
    expect(lock?.versionNumber).toBe(1);
    expect(lock?.lockedBy?.id).toBe(team.manager.userId);
    expect(lock?.approval?.approvedBy?.id).toBe(team.manager.userId);
  });

  test('a manager approves a locked agent without creating a new version', async () => {
    const { team, routes } = await seedLockedScene();
    await lockAs(routes, team.editor);

    const response = await routes.approve(team.manager);

    expect(response.status).toBe(StatusCodes.OK);
    const { lock } = lockResponseSchema.parse(await response.json());
    expect(lock?.versionNumber).toBe(1);
    expect(lock?.lockedBy?.id).toBe(team.editor.userId);
    expect(lock?.approval?.approvedBy?.id).toBe(team.manager.userId);
    expect(await db.$count(agentVersion)).toBe(1);
  });

  test('a workspace editor cannot approve', async () => {
    const { team, routes } = await seedLockedScene();

    const response = await routes.approve(team.editor);

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect((await routes.detail(team.editor)).lock).toBeNull();
  });

  test('approving an approved agent is refused', async () => {
    const { team, routes } = await seedLockedScene();
    await approveAs(routes, team.manager);

    const response = await routes.approve(team.owner);

    await expectProblem(response, StatusCodes.CONFLICT, 'agent-already-approved');
  });
});

describe('revoking an approval', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('the approver revokes and the agent stays locked without approval', async () => {
    const { team, routes } = await seedLockedScene();
    await approveAs(routes, team.manager);

    const response = await routes.revoke(team.manager);

    expect(response.status).toBe(StatusCodes.OK);
    const { lock } = lockResponseSchema.parse(await response.json());
    expect(lock?.approval).toBeNull();
    expect(lock?.versionNumber).toBe(1);
  });

  test('someone of a higher rank than the approver revokes', async () => {
    const { team, routes } = await seedLockedScene();
    await approveAs(routes, team.manager);

    const response = await routes.revoke(team.admin);

    expect(response.status).toBe(StatusCodes.OK);
  });

  test('someone of the same rank as the approver revokes', async () => {
    const { team, routes } = await seedLockedScene();
    await approveAs(routes, team.admin);

    const response = await routes.revoke(team.otherAdmin);

    expect(response.status).toBe(StatusCodes.OK);
  });

  test('a user ranked below the approver cannot revoke', async () => {
    const { team, routes } = await seedLockedScene();
    await approveAs(routes, team.admin);

    const response = await routes.revoke(team.manager);

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect((await routes.detail(team.owner)).lock?.approval).not.toBeNull();
  });

  test('revoking an agent without approval is refused', async () => {
    const { team, routes } = await seedLockedScene();
    await lockAs(routes, team.editor);

    const response = await routes.revoke(team.owner);

    await expectProblem(response, StatusCodes.CONFLICT, 'agent-not-approved');
  });

  test('approving again after a revoke creates a new approved version and keeps the old one', async () => {
    const { team, agentId, routes } = await seedLockedScene();
    await approveAs(routes, team.manager);
    await routes.revoke(team.manager);

    const response = await routes.approve(team.admin);

    expect(response.status).toBe(StatusCodes.OK);
    const { lock } = lockResponseSchema.parse(await response.json());
    expect(lock?.versionNumber).toBe(2);
    expect(lock?.approval?.approvedBy?.id).toBe(team.admin.userId);
    const versions = await db.query.agentVersion.findMany({
      where: { agentId },
      orderBy: { versionNumber: 'asc' },
    });
    expect(versions[0]?.config).toEqual(versions[1]?.config ?? {});
    expect(versions[0]?.approvedByUserId).toBe(team.manager.userId);
    expect(versions[0]?.revokedByUserId).toBe(team.manager.userId);
  });
});

describe('unlocking an agent', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('the user who locked an unapproved agent unlocks it and can edit it again', async () => {
    const { team, routes } = await seedLockedScene();
    await lockAs(routes, team.editor);

    const response = await routes.unlock(team.editor);

    expect(response.status).toBe(StatusCodes.OK);
    expect(lockResponseSchema.parse(await response.json()).lock).toBeNull();
    const edit = await routes.patch(team.editor, { systemPrompt: 'Changed.' });
    expect(edit.status).toBe(StatusCodes.OK);
  });

  test('a user of the same rank as the locker unlocks an unapproved agent', async () => {
    const { team, routes } = await seedLockedScene();
    await lockAs(routes, team.editor);

    const response = await routes.unlock(team.otherEditor);

    expect(response.status).toBe(StatusCodes.OK);
  });

  test('a user ranked below the locker cannot unlock', async () => {
    const { team, routes } = await seedLockedScene();
    await lockAs(routes, team.manager);

    const response = await routes.unlock(team.editor);

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
  });

  test('a user ranked below the approver cannot unlock an approved agent', async () => {
    const { team, routes } = await seedLockedScene();
    await lockAs(routes, team.editor);
    await approveAs(routes, team.admin);

    const response = await routes.unlock(team.editor);

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
  });

  test('someone with revoke rights unlocks an approved agent', async () => {
    const { team, routes } = await seedLockedScene();
    await approveAs(routes, team.manager);

    const response = await routes.unlock(team.owner);

    expect(response.status).toBe(StatusCodes.OK);
  });

  test('unlocking an agent that is not locked is refused', async () => {
    const { team, routes } = await seedLockedScene();

    const response = await routes.unlock(team.owner);

    await expectProblem(response, StatusCodes.CONFLICT, 'agent-not-locked');
  });

  test('locking again after an unlock creates an unapproved version and keeps the earlier approval', async () => {
    const { team, agentId, routes } = await seedLockedScene();
    await approveAs(routes, team.manager);
    await routes.unlock(team.manager);

    const response = await routes.lock(team.editor);

    const { lock } = lockResponseSchema.parse(await response.json());
    expect(lock?.versionNumber).toBe(2);
    expect(lock?.approval).toBeNull();
    const firstVersion = await db.query.agentVersion.findFirst({
      where: { agentId, versionNumber: 1 },
    });
    expect(firstVersion?.approvedByUserId).toBe(team.manager.userId);
  });
});

describe('what the lock actions allow per rank', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  const rankNames = ['editor', 'manager', 'admin', 'owner'] as const;
  const expectedOnUnlockedAgent = {
    editor: { canLock: true, canUnlock: false, canApprove: false, canRevoke: false },
    manager: { canLock: true, canUnlock: false, canApprove: true, canRevoke: false },
    admin: { canLock: true, canUnlock: false, canApprove: true, canRevoke: false },
    owner: { canLock: true, canUnlock: false, canApprove: true, canRevoke: false },
  };
  const expectedOnAgentApprovedByManager = {
    editor: { canLock: false, canUnlock: false, canApprove: false, canRevoke: false },
    manager: { canLock: false, canUnlock: true, canApprove: false, canRevoke: true },
    admin: { canLock: false, canUnlock: true, canApprove: false, canRevoke: true },
    owner: { canLock: false, canUnlock: true, canApprove: false, canRevoke: true },
  };

  function userOfRank(team: LockTeam, rankName: (typeof rankNames)[number]): SeededUser {
    return rankName === 'editor' ? team.editor : team[rankName];
  }

  test.each(rankNames)('%s on an unlocked agent', async (rankName) => {
    const { team, routes } = await seedLockedScene();

    const detail = await routes.detail(userOfRank(team, rankName));

    expect(detail.lockActions).toEqual(expectedOnUnlockedAgent[rankName]);
  });

  test.each(rankNames)('%s on an agent approved by a manager', async (rankName) => {
    const { team, routes } = await seedLockedScene();
    await approveAs(routes, team.manager);

    const detail = await routes.detail(userOfRank(team, rankName));

    expect(detail.lockActions).toEqual(expectedOnAgentApprovedByManager[rankName]);
  });

  test('a locked agent without approval lets a manager approve and the locker unlock', async () => {
    const { team, routes } = await seedLockedScene();
    await lockAs(routes, team.editor);

    expect((await routes.detail(team.manager)).lockActions).toEqual({
      canLock: false,
      canUnlock: true,
      canApprove: true,
      canRevoke: false,
    });
    expect((await routes.detail(team.editor)).lockActions.canApprove).toBe(false);
  });
});

describe('version history', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('an agent locked three times lists three versions, newest first, with their history', async () => {
    const { team, routes } = await seedLockedScene();
    await lockAs(routes, team.editor);
    await routes.unlock(team.editor);
    await approveAs(routes, team.manager);
    await routes.revoke(team.manager);
    await routes.unlock(team.admin);
    await lockAs(routes, team.editor);

    const response = await routes.versions(team.editor);

    expect(response.status).toBe(StatusCodes.OK);
    const { versions } = versionListSchema.parse(await response.json());
    expect(versions.map((version) => version.versionNumber)).toEqual([3, 2, 1]);
    const [third, second, first] = versions;
    expect(first?.lockedBy?.id).toBe(team.editor.userId);
    expect(first?.unlockedBy?.id).toBe(team.editor.userId);
    expect(second?.approvedBy?.id).toBe(team.manager.userId);
    expect(second?.revokedBy?.id).toBe(team.manager.userId);
    expect(second?.unlockedBy?.id).toBe(team.admin.userId);
    expect(third?.approvedAt).toBeNull();
    expect(third?.unlockedAt).toBeNull();
  });

  test('an agent that was never locked lists no versions', async () => {
    const { team, routes } = await seedLockedScene();

    const response = await routes.versions(team.editor);

    expect(versionListSchema.parse(await response.json()).versions).toEqual([]);
  });
});

describe('the approved version for unattended runs', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('is the current version while it carries a live approval', async () => {
    const { team, agentId, routes } = await seedLockedScene();
    await approveAs(routes, team.manager);

    const version = await getApprovedAgentVersion({ agentId, workspaceId: team.workspaceId });

    expect(version?.versionNumber).toBe(1);
    expect(version?.config.systemPrompt).toBe('Help.');
  });

  test('is missing for an unlocked, an unapproved and a revoked agent', async () => {
    const { team, agentId, routes } = await seedLockedScene();
    const scope = { agentId, workspaceId: team.workspaceId };
    expect(await getApprovedAgentVersion(scope)).toBeNull();

    await lockAs(routes, team.editor);
    expect(await getApprovedAgentVersion(scope)).toBeNull();

    await approveAs(routes, team.manager);
    await routes.revoke(team.manager);
    expect(await getApprovedAgentVersion(scope)).toBeNull();
  });
});

describe('loading an agent with its versions', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('returns the locked version and the version list through the two relations', async () => {
    const { team, agentId, routes } = await seedLockedScene();
    await lockAs(routes, team.editor);
    await routes.unlock(team.editor);
    await lockAs(routes, team.editor);

    const loaded = await db.query.agent.findFirst({
      where: { id: agentId },
      with: { lockedVersion: true, versions: { orderBy: { versionNumber: 'asc' } } },
    });

    expect(loaded?.lockedVersion?.versionNumber).toBe(2);
    expect(loaded?.versions.map((version) => version.versionNumber)).toEqual([1, 2]);
    const versionWithAgent = await db.query.agentVersion.findFirst({
      where: { versionNumber: 2 },
      with: { agent: true },
    });
    expect(versionWithAgent?.agent?.id).toBe(agentId);
  });
});
