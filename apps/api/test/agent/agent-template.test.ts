import { db } from '@repo/database';
import { agentTemplate } from '@repo/database/schema';
import { seedAuthenticatedUser, seedTokenPricedAiModel, truncateAllTables } from '@repo/testing';
import { createPrimaryId } from '@repo/utils';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

const templateListSchema = z.strictObject({
  templates: z.array(
    z.strictObject({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      aiModel: z.strictObject({ displayName: z.string() }),
    }),
  ),
});

const createdAgentSchema = z.object({
  agent: z.object({
    id: z.string(),
    userId: z.string(),
    workspaceId: z.string(),
    aiModelId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    systemPrompt: z.string(),
    tools: z.array(z.string()),
    settings: z.record(z.string(), z.unknown()),
  }),
});

async function seedTemplate() {
  const { aiModelId } = await seedTokenPricedAiModel();
  const [template] = await db
    .insert(agentTemplate)
    .values({
      aiModelId,
      name: 'Starter',
      description: 'A starter agent.',
      systemPrompt: 'Be concise.',
      tools: ['think', 'memory'],
      settings: { maxOutputTokens: 512 },
    })
    .returning();
  if (!template) {
    throw new Error('template not seeded');
  }
  return template;
}

function postFromTemplate(cookieHeader: string, workspaceId: string, templateId: string) {
  return app.request(`/workspace/${workspaceId}/agent/from-template`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ templateId }),
  });
}

beforeEach(async () => {
  await truncateAllTables();
});

describe('GET /agent-template', () => {
  test('rejects the request when no session cookie is sent', async () => {
    const response = await app.request('/agent-template');

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  test('is empty when no template exists', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request('/agent-template', { headers: { cookie: cookieHeader } });

    expect(response.status).toBe(StatusCodes.OK);
    expect(templateListSchema.parse(await response.json()).templates).toEqual([]);
  });

  test('lists templates with their model display name', async () => {
    const template = await seedTemplate();
    const { cookieHeader } = await seedAuthenticatedUser();
    const model = await db.query.aiModel.findFirst({ where: { id: template.aiModelId } });

    const response = await app.request('/agent-template', { headers: { cookie: cookieHeader } });

    expect(response.status).toBe(StatusCodes.OK);
    expect(templateListSchema.parse(await response.json()).templates).toEqual([
      {
        id: template.id,
        name: 'Starter',
        description: 'A starter agent.',
        aiModel: { displayName: model?.displayName ?? '' },
      },
    ]);
  });
});

describe('POST /workspace/:workspaceId/agent/from-template', () => {
  test('copies the template into a new agent of the workspace', async () => {
    const template = await seedTemplate();
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await postFromTemplate(cookieHeader, workspaceId, template.id);

    expect(response.status).toBe(StatusCodes.CREATED);
    const { agent } = createdAgentSchema.parse(await response.json());
    expect(agent).toMatchObject({
      userId,
      workspaceId,
      aiModelId: template.aiModelId,
      name: 'Starter',
      description: 'A starter agent.',
      systemPrompt: 'Be concise.',
      tools: ['think', 'memory'],
      settings: { maxOutputTokens: 512 },
    });
    const stored = await db.query.agent.findFirst({ where: { id: agent.id } });
    expect(stored?.workspaceId).toBe(workspaceId);
  });

  test('404s for an unknown template', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await postFromTemplate(cookieHeader, workspaceId, createPrimaryId());

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('rejects a malformed templateId', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await postFromTemplate(cookieHeader, workspaceId, 'not-an-id');

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  test("404s for another user's workspace", async () => {
    const template = await seedTemplate();
    const userA = await seedAuthenticatedUser();
    const userB = await seedAuthenticatedUser();

    const response = await postFromTemplate(userA.cookieHeader, userB.workspaceId, template.id);

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});
