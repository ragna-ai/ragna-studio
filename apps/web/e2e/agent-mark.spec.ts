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
const MEDIA_URL_PATTERN = 'https://media.test/**';
const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

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

function uniqueName(prefix: string): string {
  return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

async function seedAgent(
  request: APIRequestContext,
  name: string,
  mark: { icon?: string; tone?: string } = {},
): Promise<string> {
  const modelsResponse = await request.get(`${API_URL}/aimodel`);
  const { models } = modelsResponseSchema.parse(await modelsResponse.json());
  const model = models[0];
  if (!model) {
    throw new Error('no AI model seeded');
  }
  const base = `${API_URL}/workspace/${readWorkspaceId()}/agent`;
  const created = await request.post(base, {
    data: {
      name,
      description: 'Seeded by the agent mark e2e',
      systemPrompt: 'You are a helpful assistant for end-to-end tests.',
      aiModelId: model.id,
    },
  });
  expect(created.ok()).toBe(true);
  const agentId = agentResponseSchema.parse(await created.json()).agent.id;
  if (mark.icon || mark.tone) {
    const patched = await request.patch(`${base}/${agentId}`, { data: mark });
    expect(patched.ok()).toBe(true);
  }
  return agentId;
}

function listMark(page: Page, agentName: string) {
  return page
    .getByRole('row')
    .filter({ hasText: agentName })
    .locator('[data-slot="agent-mark"]');
}

function headerMark(page: Page) {
  return page.locator('form > header [data-slot="agent-mark"]');
}

function fieldMark(page: Page) {
  return page
    .getByText('Shown in the agent picker')
    .locator('xpath=../..')
    .locator('[data-slot="agent-mark"]');
}

async function openMarkPicker(page: Page, agentId: string) {
  await page.goto(`/agent/${agentId}`);
  await page.getByRole('button', { name: 'Change' }).click();
}

async function uploadLogo(page: Page) {
  await page
    .getByRole('tabpanel', { name: 'Image' })
    .locator('input[type="file"]')
    .setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: ONE_PX_PNG,
    });
}

async function fillCreateForm(page: Page, name: string) {
  await page.goto('/agent/create');
  await page.getByLabel('Name').fill(name);
  await page.getByRole('tab', { name: 'Model' }).click();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: /E2E Model/ }).click();
  await page.getByRole('tab', { name: 'Persona' }).click();
}

async function saveNew(page: Page) {
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\/agent$/);
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Agent updated')).toBeVisible();
}

test('shows the picked icon and tone in the agents list after saving', async ({
  page,
  request,
}) => {
  const name = uniqueName('Marked agent');
  const agentId = await seedAgent(request, name);
  await openMarkPicker(page, agentId);

  await page.getByRole('radio', { name: 'Plum' }).click();
  await page.getByRole('radio', { name: 'Invoice' }).click();
  await save(page);
  await page.goto('/agent');

  const mark = listMark(page, name);
  await expect(mark).toHaveAttribute('data-icon', 'invoice-01');
  await expect(mark).toHaveAttribute('data-tone', 'plum');
});

test('shows an uploaded image in the agents list after saving', async ({
  page,
  request,
}) => {
  await page.route(MEDIA_URL_PATTERN, (route) =>
    route.fulfill({ contentType: 'image/png', body: ONE_PX_PNG }),
  );
  const name = uniqueName('Image agent');
  const agentId = await seedAgent(request, name);
  await openMarkPicker(page, agentId);

  await page.getByRole('tab', { name: 'Image' }).click();
  await uploadLogo(page);
  await expect(
    page.getByRole('button', { name: 'Remove image' }),
  ).toBeVisible();
  await save(page);
  await expect(headerMark(page)).toHaveAttribute('data-kind', 'image');
  await page.goto('/agent');

  await expect(listMark(page, name)).toHaveAttribute('data-kind', 'image');
});

test('previews a picked image before saving without the media host', async ({
  page,
  request,
}) => {
  await page.route(MEDIA_URL_PATTERN, (route) => route.abort());
  const agentId = await seedAgent(request, uniqueName('Preview agent'));
  await openMarkPicker(page, agentId);

  await page.getByRole('tab', { name: 'Image' }).click();
  await uploadLogo(page);

  await expect(fieldMark(page)).toHaveAttribute('data-kind', 'image');
});

test('goes back to the icon after removing the image and saving', async ({
  page,
  request,
}) => {
  await page.route(MEDIA_URL_PATTERN, (route) =>
    route.fulfill({ contentType: 'image/png', body: ONE_PX_PNG }),
  );
  const name = uniqueName('Removed image agent');
  const agentId = await seedAgent(request, name, {
    icon: 'bank',
    tone: 'rose',
  });
  await openMarkPicker(page, agentId);
  await page.getByRole('tab', { name: 'Image' }).click();
  await uploadLogo(page);
  await page.getByRole('button', { name: 'Remove image' }).click();
  await save(page);
  await page.goto('/agent');

  const mark = listMark(page, name);
  await expect(mark).toHaveAttribute('data-kind', 'icon');
  await expect(mark).toHaveAttribute('data-icon', 'bank');
});

test('keeps the old mark when the page is left without saving', async ({
  page,
  request,
}) => {
  const name = uniqueName('Unsaved agent');
  const agentId = await seedAgent(request, name, {
    icon: 'bank',
    tone: 'rose',
  });
  await openMarkPicker(page, agentId);

  await page.getByRole('radio', { name: 'Stone' }).click();
  await page.getByRole('radio', { name: 'Database' }).click();
  await page.goto('/agent');

  const mark = listMark(page, name);
  await expect(mark).toHaveAttribute('data-icon', 'bank');
  await expect(mark).toHaveAttribute('data-tone', 'rose');
});

test('creates an agent with the picked icon and tone', async ({ page }) => {
  const name = uniqueName('Created marked agent');
  await fillCreateForm(page, name);
  await page.getByRole('button', { name: 'Change' }).click();

  await page.getByRole('radio', { name: 'Plum' }).click();
  await page.getByRole('radio', { name: 'Invoice' }).click();
  await saveNew(page);

  const mark = listMark(page, name);
  await expect(mark).toHaveAttribute('data-icon', 'invoice-01');
  await expect(mark).toHaveAttribute('data-tone', 'plum');
});

test('creates an agent with an uploaded image', async ({ page }) => {
  await page.route(MEDIA_URL_PATTERN, (route) =>
    route.fulfill({ contentType: 'image/png', body: ONE_PX_PNG }),
  );
  const name = uniqueName('Created image agent');
  await fillCreateForm(page, name);
  await page.getByRole('button', { name: 'Change' }).click();

  await page.getByRole('tab', { name: 'Image' }).click();
  await uploadLogo(page);
  await expect(
    page.getByRole('button', { name: 'Remove image' }),
  ).toBeVisible();
  await saveNew(page);

  await expect(listMark(page, name)).toHaveAttribute('data-kind', 'image');
});
