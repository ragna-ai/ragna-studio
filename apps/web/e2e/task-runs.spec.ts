import { expect, test, type APIRequestContext } from '@playwright/test';
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

function workspaceUrl(): string {
  return `${API_URL}/workspace/${readWorkspaceId()}`;
}

async function seedApprovedAgent(
  request: APIRequestContext,
  name: string,
): Promise<string> {
  const modelsResponse = await request.get(`${API_URL}/aimodel`);
  const { models } = modelsResponseSchema.parse(await modelsResponse.json());
  const model = models[0];
  if (!model) {
    throw new Error('no AI model seeded');
  }
  const created = await request.post(`${workspaceUrl()}/agent`, {
    data: {
      name,
      description: 'Seeded by the task runs e2e',
      systemPrompt: 'You are a helpful assistant for end-to-end tests.',
      aiModelId: model.id,
    },
  });
  expect(created.ok()).toBe(true);
  const { agent } = agentResponseSchema.parse(await created.json());
  const approved = await request.post(
    `${workspaceUrl()}/agent/${agent.id}/unattended-approval`,
  );
  expect(approved.ok()).toBe(true);
  return agent.id;
}

async function seedTask(
  request: APIRequestContext,
  title: string,
  agentId?: string,
): Promise<string> {
  const response = await request.post(`${workspaceUrl()}/task`, {
    data: { title, assignedAgentId: agentId },
  });
  expect(response.ok()).toBe(true);
  return taskResponseSchema.parse(await response.json()).task.id;
}

test('assigns an agent and starts a run from the task page', async ({
  page,
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const agentName = `Run agent ${suffix}`;
  await seedApprovedAgent(request, agentName);
  const taskId = await seedTask(request, `Run task ${suffix}`);

  await page.goto(`/tasks/${taskId}`);
  await page.getByRole('button', { name: 'Assign and start' }).click();
  await page.getByRole('menuitem', { name: agentName }).click();

  await expect(page.getByTestId('task-run-working')).toContainText(
    `${agentName} is working`,
  );
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(
    page.getByText('Stop the run to edit this task.').first(),
  ).toBeVisible();
  await expect(page.getByRole('combobox').first()).toContainText('In Progress');

  await page.getByRole('button', { name: 'Runs (1)' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Runs' }).getByTestId('task-run'),
  ).toContainText('Queued');
});

test('shows on the board that an agent is working on a task', async ({
  page,
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const agentName = `Board agent ${suffix}`;
  const title = `Board task ${suffix}`;
  const agentId = await seedApprovedAgent(request, agentName);
  const taskId = await seedTask(request, title, agentId);
  const started = await request.post(`${workspaceUrl()}/task/${taskId}/runs`, {
    data: {},
  });
  expect(started.ok()).toBe(true);

  await page.goto('/tasks');

  const card = page.getByRole('link', { name: new RegExp(title) });
  await expect(card.getByTestId('task-run-working')).toContainText(
    `${agentName} is working`,
  );
});
