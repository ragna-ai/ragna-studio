import { db, resolveEmailDraftAgent } from '@repo/database';
import { agentTemplate } from '@repo/database/schema';
import {
  resetProviderMocks,
  seedAuthenticatedUser,
  seedTokenPricedAiModel,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { createAgentForWorkspace } from './support/email-fixtures';

beforeEach(async () => {
  await truncateAllTables();
  resetProviderMocks();
  const { aiModelId } = await seedTokenPricedAiModel();
  await db
    .insert(agentTemplate)
    .values({ aiModelId, name: 'Default', systemPrompt: 'Be helpful.' });
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

  test('falls back to the private default agent when the stored default is stale', async () => {
    const { userId, sharedAgentId, personalWorkspaceId } = await seedUserWithAgents();

    const resolved = await resolveEmailDraftAgent({
      userId,
      overrideAgentId: undefined,
      defaultAgentId: sharedAgentId,
    });

    expect(resolved?.workspaceId).toBe(personalWorkspaceId);
    expect(resolved?.isDefault).toBe(true);
  });

  test('falls back to the private default agent when nothing is configured', async () => {
    const { userId, personalWorkspaceId } = await seedUserWithAgents();

    const resolved = await resolveEmailDraftAgent({
      userId,
      overrideAgentId: undefined,
      defaultAgentId: null,
    });

    expect(resolved?.workspaceId).toBe(personalWorkspaceId);
    expect(resolved?.isDefault).toBe(true);
  });
});
