import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Route,
} from '@playwright/test';
import {
  PROBLEM_TITLES,
  problemDetailsSchema,
  problemTypeUri,
  ABOUT_BLANK,
  type ProblemType,
} from '@repo/api-errors';
import { z } from 'zod';

const API_URL = 'http://localhost:3110';
const TASK_CREATE_FAILED = 'Aufgabe konnte nicht erstellt werden';
const WEB_URL = 'http://localhost:3100';
const CORS_HEADERS = {
  'access-control-allow-origin': WEB_URL,
  'access-control-allow-credentials': 'true',
};
const ENGLISH_SERVER_TEXT = 'Something broke on the server';

const workflowResponseSchema = z.object({
  workflow: z.object({ id: z.string() }),
});

interface ProblemStub {
  type?: ProblemType;
  status: number;
  errors?: { rule: string }[];
}

function problemBody({ type, status, errors }: ProblemStub): string {
  const body = problemDetailsSchema.parse({
    type: type ? problemTypeUri(type) : ABOUT_BLANK,
    title: type ? PROBLEM_TITLES[type] : 'Server error',
    status,
    detail: ENGLISH_SERVER_TEXT,
    errors,
  });
  return JSON.stringify(body);
}

function fulfillProblem(route: Route, problem: ProblemStub) {
  return route.fulfill({
    status: problem.status,
    contentType: 'application/problem+json',
    body: problemBody(problem),
    headers: CORS_HEADERS,
  });
}

async function useGermanUi(context: BrowserContext) {
  await context.addCookies([
    { name: 'i18n_redirected', value: 'de', url: WEB_URL },
  ]);
}

async function stubTaskCreate(
  page: Page,
  respond: (route: Route) => Promise<void>,
) {
  await page.route(`${API_URL}/workspace/*/task`, (route) =>
    route.request().method() === 'POST' ? respond(route) : route.fallback(),
  );
}

async function createTaskNamed(page: Page, title: string) {
  await page.goto('/tasks');
  await page.getByRole('button', { name: 'Neue Aufgabe' }).first().click();
  await page.getByPlaceholder('Titel der Aufgabe').fill(title);
  await page.getByRole('button', { name: 'Erstellen' }).click();
}

test.describe('error messages in the German UI', () => {
  test.beforeEach(async ({ context }) => {
    await useGermanUi(context);
  });

  test('shows the feature message for a server error, never server text', async ({
    page,
  }) => {
    await stubTaskCreate(page, (route) =>
      fulfillProblem(route, { status: 500 }),
    );
    await createTaskNamed(page, 'Server error task');

    await expect(page.getByText(TASK_CREATE_FAILED)).toBeVisible();
    await expect(page.getByText(ENGLISH_SERVER_TEXT)).toHaveCount(0);
  });

  test('shows the message of a known problem type', async ({ page }) => {
    await stubTaskCreate(page, (route) =>
      fulfillProblem(route, { type: 'out-of-credits', status: 402 }),
    );
    await createTaskNamed(page, 'No credits task');

    await expect(page.getByText('Du hast keine Credits mehr.')).toBeVisible();
  });

  test('shows the validation message', async ({ page }) => {
    await stubTaskCreate(page, (route) =>
      fulfillProblem(route, {
        type: 'validation',
        status: 400,
        errors: [{ rule: 'too_small' }],
      }),
    );
    await createTaskNamed(page, 'Invalid task');

    await expect(page.getByText('Bitte prüfe deine Eingabe')).toBeVisible();
  });

  test('shows the feature message for a client error without a type', async ({
    page,
  }) => {
    await stubTaskCreate(page, (route) =>
      fulfillProblem(route, { status: 403 }),
    );
    await createTaskNamed(page, 'Forbidden task');

    await expect(page.getByText(TASK_CREATE_FAILED)).toBeVisible();
  });

  test('shows the feature message for a proxy error page', async ({ page }) => {
    await stubTaskCreate(page, (route) =>
      route.fulfill({
        status: 502,
        contentType: 'text/html',
        body: '<h1>Bad Gateway</h1>',
        headers: CORS_HEADERS,
      }),
    );
    await createTaskNamed(page, 'Proxy task');

    await expect(page.getByText(TASK_CREATE_FAILED)).toBeVisible();
  });

  test('shows the feature message for a network failure', async ({ page }) => {
    await stubTaskCreate(page, (route) => route.abort('failed'));
    await createTaskNamed(page, 'Offline task');

    await expect(page.getByText(TASK_CREATE_FAILED)).toBeVisible();
  });

  test('shows one German message per broken workflow rule', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    const workspaceId = await page.evaluate(() =>
      localStorage.getItem('workspace-scope'),
    );
    const created = await request.post(
      `${API_URL}/workspace/${workspaceId}/workflow`,
      {
        data: {
          name: `Rules workflow ${crypto.randomUUID().slice(0, 8)}`,
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
    expect(created.ok()).toBe(true);
    const { workflow } = workflowResponseSchema.parse(await created.json());

    await page.route(`${API_URL}/workspace/*/workflow/*/publish`, (route) =>
      fulfillProblem(route, {
        type: 'workflow-invalid',
        status: 400,
        errors: [{ rule: 'triggerCount' }, { rule: 'cycle' }],
      }),
    );
    await page.goto(`/workflow/${workflow.id}`);
    await page.getByRole('button', { name: 'Veröffentlichen' }).click();

    await expect(
      page.getByText('Ein Workflow braucht genau einen Trigger.'),
    ).toBeVisible();
    await expect(
      page.getByText('Der Workflow enthält eine Schleife.'),
    ).toBeVisible();
  });
});
