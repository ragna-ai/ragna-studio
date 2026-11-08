import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
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

const aiModelsSchema = z.object({
  models: z.array(z.object({ id: z.string() })),
});

const WORKFLOW_DEFINITION = { nodes: [], edges: [] };

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

function daysFromNow(days: number, hours = 12, minutes = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

async function seedTask(
  request: APIRequestContext,
  title: string,
  dueDate: string | null,
) {
  const response = await request.post(workspaceUrl('/task'), {
    data: { title, dueDate },
  });
  expect(response.ok()).toBe(true);
}

async function seedWorkflow(request: APIRequestContext, name: string) {
  const response = await request.post(workspaceUrl('/workflow'), {
    data: { name, definition: WORKFLOW_DEFINITION },
  });
  expect(response.ok()).toBe(true);
}

async function seedAgent(request: APIRequestContext, name: string) {
  const modelsResponse = await request.get(`${API_URL}/aimodel`);
  expect(modelsResponse.ok()).toBe(true);
  const aiModelId = aiModelsSchema.parse(await modelsResponse.json()).models[0]
    ?.id;
  expect(aiModelId).toBeDefined();
  const response = await request.post(workspaceUrl('/agent'), {
    data: { name, aiModelId, systemPrompt: '', toolGrants: [] },
  });
  expect(response.ok()).toBe(true);
}

function card(page: Page, name: string): Locator {
  return page.getByRole('region', { name, exact: true });
}

async function openDashboard(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test.describe('dashboard', () => {
  test.describe.configure({ mode: 'serial' });

  test('says nothing is due today when no task is due', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByText('Nothing due today.')).toBeVisible();
  });

  test('names the count of tasks due today in the summary', async ({
    page,
    request,
  }) => {
    await seedTask(request, uniqueName('Summary A'), daysFromNow(0));
    await seedTask(request, uniqueName('Summary B'), daysFromNow(0));
    await openDashboard(page);
    await expect(page.getByText(/\d+ tasks are due today\./)).toBeVisible();
    await expect(page.getByText('Nothing due today.')).toHaveCount(0);
  });

  test('sorts tasks by due date with undated tasks last', async ({
    page,
    request,
  }) => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const titles = {
      none: `Sort none ${suffix}`,
      later: `Sort later ${suffix}`,
      tomorrow: `Sort tomorrow ${suffix}`,
      today: `Sort today ${suffix}`,
    };
    await seedTask(request, titles.none, null);
    await seedTask(request, titles.later, daysFromNow(5));
    await seedTask(request, titles.tomorrow, daysFromNow(1));
    await seedTask(request, titles.today, daysFromNow(0));
    await openDashboard(page);

    const rows = card(page, 'Tasks').getByRole('link').filter({
      hasText: suffix,
    });
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText(titles.today);
    await expect(rows.nth(0)).toContainText('Today');
    await expect(rows.nth(1)).toContainText(titles.tomorrow);
    await expect(rows.nth(1)).toContainText('Tomorrow');
    await expect(rows.nth(2)).toContainText(titles.later);
    await expect(rows.nth(2).getByTestId('task-due')).not.toHaveText(
      /Today|Tomorrow/,
    );
    await expect(rows.nth(3)).toContainText(titles.none);
    await expect(rows.nth(3).getByTestId('task-due')).toHaveText('');
  });

  test('shows the last run status or "Never run" per workflow', async ({
    page,
    request,
  }) => {
    const name = uniqueName('Dashboard flow');
    await seedWorkflow(request, name);
    await openDashboard(page);

    const row = card(page, 'Workflows').getByRole('link', { name });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Never run');
  });

  test('shows each agent with its model', async ({ page, request }) => {
    const name = uniqueName('Dashboard agent');
    await seedAgent(request, name);
    await openDashboard(page);

    const row = card(page, 'Agents').getByRole('button', { name });
    await expect(row).toBeVisible();
    await expect(row.locator('span').last()).not.toBeEmpty();
  });

  test('keeps an agent colour across visits', async ({ page, request }) => {
    const name = uniqueName('Colour agent');
    await seedAgent(request, name);

    const markClass = async () => {
      await openDashboard(page);
      const row = card(page, 'Agents').getByRole('button', { name });
      return row.locator('span').first().getAttribute('class');
    };
    const first = await markClass();
    const second = await markClass();
    expect(first).toMatch(/bg-id-(sea|sage|ochre|clay)-bg/);
    expect(second).toBe(first);
  });

  test('lists tasks scheduled for today with their time', async ({
    page,
    request,
  }) => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const timed = `Today timed ${suffix}`;
    const untimed = `Today untimed ${suffix}`;
    await seedTask(request, timed, daysFromNow(0, 9, 30));
    await seedTask(request, untimed, daysFromNow(0, 0, 0));
    await openDashboard(page);

    const rows = card(page, 'Today').getByRole('link');
    const timedRow = rows.filter({ hasText: timed });
    const untimedRow = rows.filter({ hasText: untimed });
    await expect(timedRow).toContainText(/09[:.]30/);
    await expect(untimedRow).toBeVisible();
    await expect(untimedRow).not.toContainText(/\d{1,2}[:.]\d{2}/);
  });

  test('links to the first item from an empty card', async ({ page }) => {
    await page.route('**/overview', async (route) => {
      const response = await route.fetch();
      const body: Record<string, unknown> = await response.json();
      await route.fulfill({
        response,
        json: {
          ...body,
          tasks: { items: [], total: 0 },
          workflows: { items: [], total: 0 },
          agents: { items: [], total: 0 },
          calendarTasks: [],
        },
      });
    });
    await openDashboard(page);

    await expect(page.getByText('No tasks yet.')).toBeVisible();
    await expect(
      card(page, 'Tasks').getByRole('link', { name: 'New task' }),
    ).toBeVisible();
    await expect(
      card(page, 'Workflows').getByRole('link', { name: 'New workflow' }),
    ).toBeVisible();
    await expect(
      card(page, 'Agents').getByRole('link', { name: 'New agent' }),
    ).toBeVisible();
    await expect(page.getByText('No tasks due today.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Documents' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('region', { name: 'Chats' })).toHaveCount(0);
  });
});
