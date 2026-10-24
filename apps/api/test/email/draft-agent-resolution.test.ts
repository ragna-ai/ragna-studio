import { resolveEmailDraftAgent } from '@repo/database';
import { resetProviderMocks, seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { createAgentForWorkspace } from './support/email-fixtures';

beforeEach(async () => {
  await truncateAllTables();
  resetProviderMocks();
});

async function seedUserWithAgents() {
  const user = await seedAuthenticatedUser();
  const privateAgentId = await createAgentForWorkspace(user.cookieHeader, user.personalWorkspaceId);
  const sharedAgentId = await createAgentForWorkspace(user.cookieHeader, user.workspaceId);
  return { ...user, privateAgentId, sharedAgentId };
}

describe('resolveEmailDraftAgent', () => {
  test('prefers the override when it is in the private workspace', async () => {
    const { userId, privateAgentId, personalWorkspaceId, cookieHeader } =
      await seedUserWithAgents();
    const otherPrivateAgentId = await createAgentForWorkspace(cookieHeader, personalWorkspaceId);

    const resolved = await resolveEmailDraftAgent({
      userId,
      overrideAgentId: otherPrivateAgentId,
      defaultAgentId: privateAgentId,
    });

    expect(resolved?.id).toBe(otherPrivateAgentId);
  });

  test('uses the stored default when there is no override', async () => {
    const { userId, privateAgentId } = await seedUserWithAgents();

    const resolved = await resolveEmailDraftAgent({
      userId,
      overrideAgentId: undefined,
      defaultAgentId: privateAgentId,
    });

    expect(resolved?.id).toBe(privateAgentId);
  });

  test('ignores an override outside the private workspace', async () => {
    const { userId, privateAgentId, sharedAgentId } = await seedUserWithAgents();

    const resolved = await resolveEmailDraftAgent({
      userId,
      overrideAgentId: sharedAgentId,
      defaultAgentId: privateAgentId,
    });

    expect(resolved?.id).toBe(privateAgentId);
  });

  test('returns null when the stored default is outside the private workspace', async () => {
    const { userId, sharedAgentId } = await seedUserWithAgents();

    const resolved = await resolveEmailDraftAgent({
      userId,
      overrideAgentId: undefined,
      defaultAgentId: sharedAgentId,
    });

    expect(resolved).toBeNull();
  });

  test('returns null when nothing is configured', async () => {
    const { userId } = await seedUserWithAgents();

    const resolved = await resolveEmailDraftAgent({
      userId,
      overrideAgentId: undefined,
      defaultAgentId: null,
    });

    expect(resolved).toBeNull();
  });
});
