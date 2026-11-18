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

function uniqueName(prefix: string): string {
  return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

async function seedWorkflow(request: APIRequestContext, name: string) {
  const response = await request.post(
    `${API_URL}/workspace/${readWorkspaceId()}/workflow`,
    {
      data: {
        name,
        definition: {
          nodes: [
            {
              id: 'trigger-1',
              type: 'trigger',
              position: { x: 0, y: 0 },
              data: { label: 'Start', config: { kind: 'manual' } },
            },
          ],
          edges: [],
        },
      },
    },
  );
  expect(response.ok()).toBe(true);
}

async function openRowMenu(page: Page, rowText: string) {
  const row = page.getByRole('row').filter({ hasText: rowText });
  await row.getByRole('button', { name: 'Actions' }).click();
}

test('lists a workflow and opens it from its row', async ({
  page,
  request,
}) => {
  const name = uniqueName('Listed workflow');
  await seedWorkflow(request, name);
  await page.goto('/workflow');

  await page.getByRole('row').filter({ hasText: name }).click();

  await expect(page).toHaveURL(/\/workflow\/[^/?]+$/);
});

test('deletes a workflow after confirming', async ({ page, request }) => {
  const name = uniqueName('Doomed workflow');
  await seedWorkflow(request, name);
  await page.goto('/workflow');
  await expect(page.getByRole('link', { name })).toBeVisible();

  await openRowMenu(page, name);
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete' })
    .click();

  await expect(page.getByRole('link', { name })).toHaveCount(0);
});
