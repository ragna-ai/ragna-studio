import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { STORAGE_STATE_PATH } from '../playwright.config';

const API_URL = 'http://localhost:3110';

const storageStateSchema = z.object({
  origins: z.array(
    z.object({
      localStorage: z.array(z.object({ name: z.string(), value: z.string() })),
    }),
  ),
});
const modelsResponseSchema = z.object({
  models: z.array(z.object({ id: z.string() })),
});

function readWorkspaceId(): string {
  const state = storageStateSchema.parse(
    JSON.parse(readFileSync(STORAGE_STATE_PATH, 'utf8')),
  );
  const entry = state.origins
    .flatMap((origin) => origin.localStorage)
    .find((item) => item.name === 'workspace-scope');
  if (!entry) {
    throw new Error('workspace-scope missing in storage state');
  }
  return entry.value;
}

test('shows the no-match state for an unknown search and restores the list on clear', async ({
  page,
  request,
}) => {
  const name = `Searchable agent ${crypto.randomUUID().slice(0, 8)}`;
  const modelsResponse = await request.get(`${API_URL}/aimodel`);
  const { models } = modelsResponseSchema.parse(await modelsResponse.json());
  const model = models[0];
  if (!model) {
    throw new Error('no AI model seeded');
  }
  const created = await request.post(
    `${API_URL}/workspace/${readWorkspaceId()}/agent`,
    {
      data: {
        name,
        systemPrompt: 'You are a helpful assistant for end-to-end tests.',
        aiModelId: model.id,
      },
    },
  );
  expect(created.ok()).toBe(true);
  await page.goto('/agent');
  await expect(page.getByRole('link', { name })).toBeVisible();

  await page.getByRole('textbox', { name: 'Search agents' }).fill('zzzqqq');

  await expect(page.getByText('No agents match')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByText('No agents match')).toHaveCount(0);
  await expect(page.getByRole('link', { name })).toBeVisible();
});
