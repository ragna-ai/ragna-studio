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

function agentUrl(agentId: string): string {
  return `${API_URL}/workspace/${readWorkspaceId()}/agent/${agentId}`;
}

async function seedAgent(request: APIRequestContext): Promise<string> {
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
        name: `Lock agent ${crypto.randomUUID().slice(0, 8)}`,
        description: 'Seeded by the agent lock e2e',
        systemPrompt: 'You are a helpful assistant for end-to-end tests.',
        aiModelId: model.id,
        toolGrants: [
          { id: 'datasets' },
          { id: 'google-drive', access: 'read' },
        ],
      },
    },
  );
  expect(created.ok()).toBe(true);
  return agentResponseSchema.parse(await created.json()).agent.id;
}

async function lockViaApi(request: APIRequestContext, agentId: string) {
  const locked = await request.post(`${agentUrl(agentId)}/lock`);
  expect(locked.ok()).toBe(true);
}

async function lockInPage(page: Page) {
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  await expect(page.getByText('Agent locked')).toBeVisible();
}

test('locks and unlocks an agent', async ({ page, request }) => {
  const agentId = await seedAgent(request);
  await page.goto(`/agent/${agentId}`);
  await expect(page.getByTestId('agent-lock-banner')).toBeHidden();

  await lockInPage(page);

  await expect(page.getByTestId('agent-lock-banner')).toContainText(
    'Locked by',
  );
  await expect(page.getByLabel('Name')).toBeEditable();
  await page.getByRole('tab', { name: 'Model' }).click();
  await expect(page.getByRole('combobox').first()).not.toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Lock', exact: true }),
  ).toBeHidden();

  await page.getByRole('button', { name: 'Unlock' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Unlock' })
    .click();

  await expect(page.getByText('Agent unlocked')).toBeVisible();
  await expect(page.getByTestId('agent-lock-banner')).toBeHidden();
});

test('lists the tools the agent can use before approving', async ({
  page,
  request,
}) => {
  const agentId = await seedAgent(request);
  await page.goto(`/agent/${agentId}`);

  await page
    .getByRole('button', { name: 'Approve for unattended runs' })
    .click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('This agent can use:')).toBeVisible();
  await expect(dialog).toContainText('Datasets, Google Drive (read only)');
  await expect(
    dialog.getByText(
      'Knowledge files and data the agent reads can change without a new approval.',
    ),
  ).toBeVisible();
  await expect(
    dialog.getByText('You are responsible for its actions in unattended runs.'),
  ).toBeVisible();

  await dialog.getByRole('button', { name: 'Approve', exact: true }).click();

  await expect(page.getByTestId('agent-lock-banner')).toContainText(
    'approved for unattended runs by',
  );
  await expect(
    page.getByRole('button', { name: 'Revoke approval' }),
  ).toBeVisible();
});

test('shows how many workflows and tasks use the agent before unlocking', async ({
  page,
  request,
}) => {
  const agentId = await seedAgent(request);
  await lockViaApi(request, agentId);
  await page.goto(`/agent/${agentId}`);

  await page.getByRole('button', { name: 'Unlock' }).click();

  const usage = page.getByTestId('agent-unlock-usage');
  await expect(usage).toContainText('No workflow uses this agent.');
  await expect(usage).toContainText('No open task is assigned to this agent.');
});

test('lists the versions of an agent, and an empty state before the first lock', async ({
  page,
  request,
}) => {
  const agentId = await seedAgent(request);
  await page.goto(`/agent/${agentId}`);

  await page.getByRole('button', { name: 'Versions' }).click();
  await expect(page.getByTestId('agent-versions-empty')).toBeVisible();
  await page.keyboard.press('Escape');

  await lockInPage(page);
  await page.getByRole('button', { name: 'Versions' }).click();

  await expect(page.getByText('Version 1')).toBeVisible();
  await expect(page.getByText(/^Locked by .* on /)).toBeVisible();
});
