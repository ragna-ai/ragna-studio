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

async function seedAgent(
  request: APIRequestContext,
  name = `Lock agent ${crypto.randomUUID().slice(0, 8)}`,
): Promise<string> {
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

async function openLockMenu(page: Page) {
  await page.getByRole('button', { name: /^Agent (locked|unlocked)$/ }).click();
}

async function clickMenuItem(page: Page, name: string, exact = false) {
  await openLockMenu(page);
  await page.getByRole('menuitem', { name, exact }).click();
}

async function openVersions(page: Page) {
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Versions' }).click();
}

async function lockInPage(page: Page) {
  await clickMenuItem(page, 'Lock', true);
  await expect(page.getByText('Agent locked')).toBeVisible();
}

test('locks and unlocks an agent', async ({ page, request }) => {
  const agentId = await seedAgent(request);
  await page.goto(`/agent/${agentId}`);
  await expect(page.getByTestId('agent-lock-banner')).toBeHidden();

  await expect(
    page.getByRole('button', { name: 'Agent unlocked' }),
  ).toBeVisible();

  await lockInPage(page);

  await expect(
    page.getByRole('button', { name: 'Agent locked' }),
  ).toBeVisible();
  await expect(page.getByTestId('agent-lock-banner')).toContainText(
    'Locked by',
  );
  await expect(page.getByLabel('Name')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save' })).toBeHidden();
  await page.getByRole('tab', { name: 'Model' }).click();
  await expect(page.getByLabel('Model', { exact: true })).toBeDisabled();
  await openLockMenu(page);
  await expect(
    page.getByRole('menuitem', { name: 'Lock', exact: true }),
  ).toBeHidden();
  await page.keyboard.press('Escape');

  await clickMenuItem(page, 'Unlock');
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

  await clickMenuItem(page, 'Approve for unattended runs');

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
    'Approved for unattended runs by',
  );
  await expect(
    page.getByRole('img', { name: /Approved for unattended runs by/ }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: /Locked by/ })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Agent locked' }),
  ).toBeVisible();
  await openLockMenu(page);
  await expect(
    page.getByRole('menuitem', { name: 'Revoke approval for unattended runs' }),
  ).toBeVisible();
});

test('shows how many workflows and tasks use the agent before unlocking', async ({
  page,
  request,
}) => {
  const agentId = await seedAgent(request);
  await lockViaApi(request, agentId);
  await page.goto(`/agent/${agentId}`);

  await clickMenuItem(page, 'Unlock');

  const usage = page.getByTestId('agent-unlock-usage');
  await expect(usage).toContainText('No workflow uses this agent.');
  await expect(usage).toContainText('No open task is assigned to this agent.');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Approved for unattended runs')).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: 'Unlock', exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Unlock and revoke approval' }),
  ).toHaveCount(0);
});

test('warns that unlocking also revokes the approval of an approved agent', async ({
  page,
  request,
}) => {
  const agentId = await seedAgent(request);
  const approved = await request.post(
    `${agentUrl(agentId)}/unattended-approval`,
  );
  expect(approved.ok()).toBe(true);
  await page.goto(`/agent/${agentId}`);

  await clickMenuItem(page, 'Unlock');

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Approved for unattended runs')).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Unlock and revoke approval' }),
  ).toBeVisible();
});

test('lists the versions of an agent, and an empty state before the first lock', async ({
  page,
  request,
}) => {
  const agentId = await seedAgent(request);
  await page.goto(`/agent/${agentId}`);

  await openVersions(page);
  await expect(page.getByTestId('agent-versions-empty')).toBeVisible();
  await page.keyboard.press('Escape');

  await lockInPage(page);
  await openVersions(page);

  await expect(page.getByText('Version 1')).toBeVisible();
  await expect(page.getByText(/^Locked by .* on /)).toBeVisible();
});

test('keeps the memory read-only while the agent is locked', async ({
  page,
  request,
}) => {
  const agentId = await seedAgent(request);
  await lockViaApi(request, agentId);
  await page.goto(`/agent/${agentId}`);

  await page.getByRole('tab', { name: 'Memory' }).click();

  await expect(page.locator('[contenteditable="true"]')).toHaveCount(0);
});

test('shows the lock on the agent mark in the list and blocks deleting a locked agent', async ({
  page,
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const lockedId = await seedAgent(request, `Listed locked ${suffix}`);
  await seedAgent(request, `Listed open ${suffix}`);
  await lockViaApi(request, lockedId);
  await page.goto('/agent');
  await page.getByRole('textbox', { name: 'Search agents' }).fill(suffix);
  const lockedRow = page.getByRole('row').filter({ hasText: 'Listed locked' });
  const openRow = page.getByRole('row').filter({ hasText: 'Listed open' });

  await expect(
    lockedRow.getByRole('img', { name: /^Locked by / }),
  ).toBeVisible();
  await expect(openRow).toBeVisible();
  await expect(openRow.getByRole('img', { name: /^Locked by / })).toHaveCount(
    0,
  );

  await lockedRow.getByRole('button', { name: 'Actions' }).click();
  await expect(page.getByRole('menuitem', { name: /Delete/ })).toBeDisabled();
});
