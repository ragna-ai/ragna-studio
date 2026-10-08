import { seedAuthenticatedUser, seedTokenPricedAiModel, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// GET /aimodel. Not workspace-scoped,
// just authMiddleware. Auth/authorization are covered exhaustively in
// test/auth/; this file only checks the aimodel feature's own behavior:
// listing models and deriving the deduped/capitalized providers list.

const modelSchema = z.object({
  id: z.string(),
  provider: z.string(),
  displayName: z.string(),
});

const providerSchema = z.object({
  id: z.string(),
  displayName: z.string(),
});

const aiModelResponseSchema = z.object({
  models: z.array(modelSchema),
  providers: z.array(providerSchema),
});

describe('GET /aimodel', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('rejects the request when no session cookie is sent', async () => {
    const response = await app.request('/aimodel');

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  test('starts empty when no models are seeded', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request('/aimodel', {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = aiModelResponseSchema.parse(await response.json());
    expect(body.models).toEqual([]);
    expect(body.providers).toEqual([]);
  });

  test('derives a deduped, capitalized providers list from the seeded models', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();
    const anthropicModel = await seedTokenPricedAiModel({ provider: 'anthropic' });
    const anthropicModelTwo = await seedTokenPricedAiModel({ provider: 'anthropic' });
    const openaiModel = await seedTokenPricedAiModel({ provider: 'openai' });

    const response = await app.request('/aimodel', {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = aiModelResponseSchema.parse(await response.json());
    expect(body.models.map((model) => model.id).sort()).toEqual(
      [anthropicModel.aiModelId, anthropicModelTwo.aiModelId, openaiModel.aiModelId].sort(),
    );
    expect(body.providers.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: 'anthropic', displayName: 'Anthropic' },
      { id: 'openai', displayName: 'Openai' },
    ]);
  });
});
