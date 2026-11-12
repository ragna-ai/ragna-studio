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
const modelsResponseSchema = z.object({
  models: z.array(z.object({ id: z.string() })),
});
const agentResponseSchema = z.object({ agent: z.object({ id: z.string() }) });
const chatResponseSchema = z.object({ chat: z.object({ id: z.string() }) });

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

function workspaceUrl(path: string): string {
  return `${API_URL}/workspace/${readWorkspaceId()}${path}`;
}

function uniqueName(prefix: string): string {
  return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

async function seedAgent(
  request: APIRequestContext,
  name: string,
): Promise<string> {
  const modelsResponse = await request.get(`${API_URL}/aimodel`);
  expect(modelsResponse.ok()).toBe(true);
  const { models } = modelsResponseSchema.parse(await modelsResponse.json());
  const model = models[0];
  if (!model) {
    throw new Error('no AI model seeded');
  }
  const response = await request.post(workspaceUrl('/agent'), {
    data: {
      name,
      description: 'Seeded by the list page e2e',
      systemPrompt: 'You are a helpful assistant for end-to-end tests.',
      aiModelId: model.id,
    },
  });
  expect(response.ok()).toBe(true);
  return agentResponseSchema.parse(await response.json()).agent.id;
}

async function seedChat(
  request: APIRequestContext,
  agentId: string,
): Promise<string> {
  const response = await request.post(workspaceUrl('/chat'), {
    data: { agentId },
  });
  expect(response.ok()).toBe(true);
  return chatResponseSchema.parse(await response.json()).chat.id;
}

async function renameChat(
  request: APIRequestContext,
  chatId: string,
  title: string,
) {
  const response = await request.patch(workspaceUrl(`/chat/${chatId}`), {
    data: { title },
  });
  expect(response.ok()).toBe(true);
}

async function openRowMenu(page: Page, rowText: string) {
  const row = page.getByRole('row').filter({ hasText: rowText });
  await row.getByRole('button', { name: 'Actions' }).click();
}

test('deletes an agent after confirming', async ({ page, request }) => {
  const name = uniqueName('Doomed agent');
  await seedAgent(request, name);
  await page.goto('/agent');
  await expect(page.getByRole('link', { name })).toBeVisible();

  await openRowMenu(page, name);
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete' })
    .click();

  await expect(page.getByRole('link', { name })).toHaveCount(0);
});

test('renames a chat from the history through the dialog', async ({
  page,
  request,
}) => {
  const agentId = await seedAgent(request, uniqueName('Chat agent'));
  const chatId = await seedChat(request, agentId);
  const oldTitle = uniqueName('Old chat title');
  const newTitle = uniqueName('New chat title');
  await renameChat(request, chatId, oldTitle);
  await page.goto('/chat/history');
  await expect(page.getByRole('link', { name: oldTitle })).toBeVisible();

  await openRowMenu(page, oldTitle);
  await page.getByRole('menuitem', { name: 'Rename chat' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill(newTitle);
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('link', { name: newTitle })).toBeVisible();
  await expect(page.getByRole('link', { name: oldTitle })).toHaveCount(0);
});

test('deletes a chat from the history after confirming', async ({
  page,
  request,
}) => {
  const agentId = await seedAgent(request, uniqueName('Chat agent'));
  const chatId = await seedChat(request, agentId);
  const title = uniqueName('Doomed chat');
  await renameChat(request, chatId, title);
  await page.goto('/chat/history');
  await expect(page.getByRole('link', { name: title })).toBeVisible();

  await openRowMenu(page, title);
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete' })
    .click();

  await expect(page.getByRole('link', { name: title })).toHaveCount(0);
});
