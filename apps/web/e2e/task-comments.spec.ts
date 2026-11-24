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

test('posts a comment, then shows it after a reload and marks an edit', async ({
  page,
  request,
}) => {
  const response = await request.post(
    `${API_URL}/workspace/${readWorkspaceId()}/task`,
    { data: { title: `Comments ${crypto.randomUUID().slice(0, 8)}` } },
  );
  expect(response.ok()).toBe(true);
  const { task } = taskResponseSchema.parse(await response.json());
  const comment = `First comment ${crypto.randomUUID().slice(0, 8)}`;
  const editedComment = `Edited comment ${crypto.randomUUID().slice(0, 8)}`;

  await page.goto(`/tasks/${task.id}`);
  await expect(page.getByText('No comments yet.')).toBeVisible();

  const comments = page.getByRole('region', { name: 'Comments' });
  await comments.locator('[contenteditable="true"]').click();
  await page.keyboard.type(comment);
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(page.getByText(comment)).toBeVisible();

  await page.reload();
  const item = page.getByTestId('task-comment');
  await expect(item.getByText(comment)).toBeVisible();
  await expect(item.getByText('(edited)')).toHaveCount(0);

  await item.getByRole('button', { name: 'Edit' }).click();
  const editor = item.locator('[contenteditable="true"]');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(editedComment);
  await item.getByRole('button', { name: 'Save' }).click();

  await expect(item.getByText(editedComment)).toBeVisible();
  await expect(item.getByText('(edited)')).toBeVisible();
});
