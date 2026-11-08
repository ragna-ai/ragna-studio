import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
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

const datasetResponseSchema = z.object({
  dataset: z.object({ id: z.string() }),
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

async function seedDataset(
  request: APIRequestContext,
): Promise<{ id: string; name: string }> {
  const name = `Trail ${crypto.randomUUID().slice(0, 8)}`;
  const response = await request.post(
    `${API_URL}/workspace/${readWorkspaceId()}/dataset`,
    {
      data: {
        name,
        columns: [{ id: crypto.randomUUID(), name: 'Title', type: 'text' }],
      },
    },
  );
  expect(response.ok()).toBe(true);
  const { dataset } = datasetResponseSchema.parse(await response.json());
  return { id: dataset.id, name };
}

function trail(page: Page) {
  return page.getByRole('navigation', { name: 'breadcrumb' });
}

test.describe('page breadcrumb', () => {
  test('shows the section name on a page that declares no trail', async ({
    page,
  }) => {
    await page.goto('/dataset');

    await expect(trail(page)).toContainText('Datasets');
    await expect(trail(page).locator('[aria-current="page"]')).toHaveText(
      'Datasets',
    );
  });

  test('shows the section link and the item name on a detail page', async ({
    page,
    request,
  }) => {
    const dataset = await seedDataset(request);

    await page.goto(`/dataset/${dataset.id}`);

    await expect(
      trail(page).getByRole('link', { name: 'Datasets' }),
    ).toBeVisible();
    await expect(
      trail(page).getByRole('link', { name: dataset.name }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('leaves no crumb behind after navigating to another section', async ({
    page,
    request,
  }) => {
    const dataset = await seedDataset(request);
    await page.goto(`/dataset/${dataset.id}`);
    await expect(trail(page)).toContainText(dataset.name);

    await page.getByRole('link', { name: 'Agents', exact: true }).click();

    await expect(page).toHaveURL(/\/agent/);
    await expect(trail(page)).toContainText('Agents');
    await expect(trail(page)).not.toContainText(dataset.name);
    await expect(trail(page)).not.toContainText('Datasets');
  });
});
