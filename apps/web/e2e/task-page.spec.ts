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
const taskResponseSchema = z.object({ task: z.object({ id: z.string() }) });

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

test('saves an edited title from the top bar save button', async ({
  page,
  request,
}) => {
  const title = `Before ${crypto.randomUUID().slice(0, 8)}`;
  const newTitle = `After ${crypto.randomUUID().slice(0, 8)}`;
  const response = await request.post(
    `${API_URL}/workspace/${readWorkspaceId()}/task`,
    { data: { title } },
  );
  expect(response.ok()).toBe(true);
  const { task } = taskResponseSchema.parse(await response.json());

  await page.goto(`/tasks/${task.id}`);

  const saveButton = page
    .getByRole('banner')
    .getByRole('button', { name: 'Saved' });
  await expect(saveButton).toBeVisible();

  await page.getByRole('textbox', { name: 'Rename task' }).fill(newTitle);
  await saveButton.click();
  await expect(saveButton).toBeVisible();

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Rename task' })).toHaveValue(
    newTitle,
  );
});
