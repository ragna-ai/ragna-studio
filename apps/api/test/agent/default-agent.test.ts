import { db } from '@repo/database';
import { agentTemplate } from '@repo/database/schema';
import {
  seedAuthenticatedUser,
  seedOrganizationMember,
  seedTokenPricedAiModel,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// The default agent is one shared clone per workspace, created on first use.

const createdChatSchema = z.object({ chat: z.object({ id: z.string(), agentId: z.string() }) });

async function seedAgentTemplate() {
  const { aiModelId } = await seedTokenPricedAiModel();
  await db
    .insert(agentTemplate)
    .values({ aiModelId, name: 'Default', systemPrompt: 'Be helpful.' });
}

async function createChatWithDefaultAgent(user: { cookieHeader: string; workspaceId: string }) {
  const response = await app.request(`/workspace/${user.workspaceId}/chat`, {
    method: 'POST',
    headers: { cookie: user.cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  expect(response.status).toBe(StatusCodes.CREATED);
  return createdChatSchema.parse(await response.json()).chat;
}

beforeEach(async () => {
  await truncateAllTables();
});

describe('default agent per workspace', () => {
  test('is shared by every member of the workspace', async () => {
    await seedAgentTemplate();
    const owner = await seedAuthenticatedUser();
    const membership = await db.query.member.findFirst({ where: { userId: owner.userId } });
    const colleague = await seedOrganizationMember({
      organizationId: membership?.organizationId ?? '',
      role: 'member',
    });

    const ownerChat = await createChatWithDefaultAgent(owner);
    const colleagueChat = await createChatWithDefaultAgent(colleague);

    expect(colleagueChat.agentId).toBe(ownerChat.agentId);
    const defaults = await db.query.agent.findMany({
      where: { workspaceId: owner.workspaceId, isDefault: true },
    });
    expect(defaults.map((agent) => agent.id)).toEqual([ownerChat.agentId]);
  });

  test('survives concurrent first use by two members', async () => {
    await seedAgentTemplate();
    const owner = await seedAuthenticatedUser();
    const membership = await db.query.member.findFirst({ where: { userId: owner.userId } });
    const colleague = await seedOrganizationMember({
      organizationId: membership?.organizationId ?? '',
      role: 'member',
    });

    const [ownerChat, colleagueChat] = await Promise.all([
      createChatWithDefaultAgent(owner),
      createChatWithDefaultAgent(colleague),
    ]);

    expect(colleagueChat.agentId).toBe(ownerChat.agentId);
  });

  test('is separate for each workspace', async () => {
    await seedAgentTemplate();
    const first = await seedAuthenticatedUser();
    const second = await seedAuthenticatedUser();

    const firstChat = await createChatWithDefaultAgent(first);
    const secondChat = await createChatWithDefaultAgent(second);

    expect(secondChat.agentId).not.toBe(firstChat.agentId);
  });
});
