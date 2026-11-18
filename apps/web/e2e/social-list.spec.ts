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

async function seedPost(request: APIRequestContext, content: string) {
  const response = await request.post(
    `${API_URL}/workspace/${readWorkspaceId()}/social-post`,
    { data: { content } },
  );
  expect(response.ok()).toBe(true);
}

async function openRowMenu(page: Page, rowText: string) {
  const row = page.getByRole('row').filter({ hasText: rowText });
  await row.getByRole('button', { name: 'Actions' }).click();
}

test('shows a post row, truncated inside the table, with an actions menu', async ({
  page,
  request,
}) => {
  const marker = crypto.randomUUID().slice(0, 8);
  const content = `${marker} ${'very long post content '.repeat(40)}`;
  await seedPost(request, content);
  await page.goto('/social');

  const row = page.getByRole('row').filter({ hasText: marker });
  await expect(row).toBeVisible();

  const tableBox = await page.getByRole('table').boundingBox();
  const rowBox = await row.boundingBox();
  expect(tableBox).not.toBeNull();
  expect(rowBox).not.toBeNull();
  expect(rowBox?.width).toBeLessThanOrEqual((tableBox?.width ?? 0) + 1);

  await openRowMenu(page, marker);
  await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
});

test('shows the empty state when there are no posts', async ({ page }) => {
  await page.route(/\/social-post(\?.*)?$/, (route) =>
    route.fulfill({
      json: { posts: [], meta: { totalCount: 0 } },
    }),
  );
  await page.goto('/social');

  await expect(page.getByText('No posts yet')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});
