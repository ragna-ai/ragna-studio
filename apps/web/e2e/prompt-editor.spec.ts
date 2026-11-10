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
const PROMPT_LIMIT = 30_000;
const INSTRUCTIONS_LABEL = 'Instructions';

const storageStateSchema = z.object({
  origins: z.array(
    z.object({
      localStorage: z.array(z.object({ name: z.string(), value: z.string() })),
    }),
  ),
});
const modelsResponseSchema = z.object({
  models: z.array(z.object({ id: z.string() })).min(1),
});
const agentResponseSchema = z.object({
  agent: z.object({
    id: z.string(),
    systemPrompt: z.string(),
    context: z.string().nullable(),
  }),
});
const workflowResponseSchema = z.object({
  workflow: z.object({ id: z.string(), definition: z.unknown() }),
});
const promptNodeSchema = z.object({
  id: z.string(),
  data: z.object({ config: z.object({ prompt: z.string() }) }),
});
const storedDefinitionSchema = z.object({ nodes: z.array(z.unknown()) });

interface AgentSeed {
  systemPrompt?: string;
  context?: string;
}

interface PromptNodeSeed {
  id: string;
  type: 'agent' | 'team';
  label: string;
  prompt: string;
  x: number;
}

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
  { systemPrompt = '', context }: AgentSeed = {},
): Promise<string> {
  const modelsResponse = await request.get(`${API_URL}/aimodel`);
  expect(modelsResponse.ok()).toBe(true);
  const [model] = modelsResponseSchema.parse(
    await modelsResponse.json(),
  ).models;
  const response = await request.post(workspaceUrl('/agent'), {
    data: {
      name: uniqueName('Prompt agent'),
      aiModelId: model?.id,
      systemPrompt,
      context,
      toolGrants: [],
    },
  });
  expect(response.ok()).toBe(true);
  return agentResponseSchema.parse(await response.json()).agent.id;
}

async function fetchAgent(request: APIRequestContext, agentId: string) {
  const response = await request.get(workspaceUrl(`/agent/${agentId}`));
  expect(response.ok()).toBe(true);
  return agentResponseSchema.parse(await response.json()).agent;
}

function buildPromptNode(agentId: string, seed: PromptNodeSeed) {
  const config =
    seed.type === 'agent'
      ? { agentId, prompt: seed.prompt }
      : {
          mode: 'delegate',
          leadAgentId: agentId,
          prompt: seed.prompt,
          members: [{ agentId, role: '' }],
        };
  return {
    id: seed.id,
    type: seed.type,
    position: { x: seed.x, y: 160 },
    data: { label: seed.label, config },
  };
}

async function seedWorkflow(
  request: APIRequestContext,
  nodes: readonly PromptNodeSeed[],
): Promise<string> {
  const agentId = await seedAgent(request);
  const trigger = {
    id: 'trigger-1',
    type: 'trigger',
    position: { x: 0, y: 0 },
    data: { label: 'Start', config: { kind: 'manual' } },
  };
  const response = await request.post(workspaceUrl('/workflow'), {
    data: {
      name: uniqueName('Prompt workflow'),
      definition: {
        nodes: [
          trigger,
          ...nodes.map((node) => buildPromptNode(agentId, node)),
        ],
        edges: [],
      },
    },
  });
  expect(response.ok()).toBe(true);
  return workflowResponseSchema.parse(await response.json()).workflow.id;
}

async function fetchNodePrompt(
  request: APIRequestContext,
  workflowId: string,
  nodeId: string,
): Promise<string> {
  const response = await request.get(workspaceUrl(`/workflow/${workflowId}`));
  expect(response.ok()).toBe(true);
  const { definition } = workflowResponseSchema.parse(
    await response.json(),
  ).workflow;
  const node = storedDefinitionSchema
    .parse(definition)
    .nodes.map((candidate) => promptNodeSchema.safeParse(candidate))
    .find((parsed) => parsed.success && parsed.data.id === nodeId);
  if (!node?.success) {
    throw new Error(`node ${nodeId} missing in stored workflow`);
  }
  return node.data.data.config.prompt;
}

function promptField(page: Page, label: string): Locator {
  return page.getByRole('textbox', { name: label, exact: true });
}

async function replaceFormattedText(field: Locator, text: string) {
  await field.click();
  await field.press('ControlOrMeta+A');
  await field.press('Backspace');
  await field.pressSequentially(text);
}

async function showRawView(page: Page) {
  await page.getByRole('tab', { name: 'Raw text' }).click();
}

async function showFormattedView(page: Page) {
  await page.getByRole('tab', { name: 'Markdown' }).click();
}

async function saveAgent(page: Page, agentId: string) {
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      response.url().includes(`/agent/${agentId}`),
  );
  await page.getByRole('button', { name: 'Save' }).click();
  expect((await saved).ok()).toBe(true);
}

async function saveWorkflow(page: Page, workflowId: string) {
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      response.url().includes(`/workflow/${workflowId}`),
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await saved).ok()).toBe(true);
}

test.describe('agent instructions and context', () => {
  test('turns "# " into a heading and saves it as markdown', async ({
    page,
    request,
  }) => {
    const agentId = await seedAgent(request);
    await page.goto(`/agent/${agentId}`);

    await replaceFormattedText(promptField(page, INSTRUCTIONS_LABEL), '# Role');
    await expect(
      page.getByRole('heading', { name: 'Role', level: 1 }),
    ).toBeVisible();
    await saveAgent(page, agentId);

    const saved = await fetchAgent(request, agentId);
    expect(saved.systemPrompt.startsWith('# Role')).toBe(true);
  });

  test('shows saved formatting in instructions and context', async ({
    page,
    request,
  }) => {
    const agentId = await seedAgent(request, {
      systemPrompt: '# Role\n\n- first\n- second',
      context: '## Notes\n\nSome **bold** text',
    });
    await page.goto(`/agent/${agentId}`);

    await expect(
      page.getByRole('heading', { name: 'Role', level: 1 }),
    ).toBeVisible();
    await expect(
      page.locator('#panel-persona').getByRole('listitem'),
    ).toHaveText(['first', 'second']);

    await page.getByRole('tab', { name: 'Context' }).click();
    await expect(
      page.getByRole('heading', { name: 'Notes', level: 2 }),
    ).toBeVisible();
    await expect(page.locator('strong', { hasText: 'bold' })).toBeVisible();
  });

  test('saves tags, placeholders and symbols exactly as typed', async ({
    page,
    request,
  }) => {
    const agentId = await seedAgent(request);
    await page.goto(`/agent/${agentId}`);

    await replaceFormattedText(
      promptField(page, INSTRUCTIONS_LABEL),
      '<rules> {{user_name}} snake_case 2 * 3 </rules>',
    );
    await saveAgent(page, agentId);

    const { systemPrompt } = await fetchAgent(request, agentId);
    for (const fragment of [
      '<rules>',
      '</rules>',
      '{{user_name}}',
      'snake_case',
      '2 * 3',
    ]) {
      expect(systemPrompt).toContain(fragment);
    }
    expect(systemPrompt).not.toContain('&lt;');
    expect(systemPrompt).not.toContain('\\');
  });

  test('saves typed quotes, dashes, arrows and symbols without substitution', async ({
    page,
    request,
  }) => {
    const agentId = await seedAgent(request);
    const typed = `"quoted" it's -- a -> b != c ... (c) 2 * 3`;
    await page.goto(`/agent/${agentId}`);

    await replaceFormattedText(promptField(page, INSTRUCTIONS_LABEL), typed);
    await saveAgent(page, agentId);

    expect((await fetchAgent(request, agentId)).systemPrompt).toBe(typed);
  });

  test('saves two typed asterisks between numbers without italics', async ({
    page,
    request,
  }) => {
    const agentId = await seedAgent(request);
    const typed = '2 * 3 * 4';
    await page.goto(`/agent/${agentId}`);

    await replaceFormattedText(promptField(page, INSTRUCTIONS_LABEL), typed);
    await saveAgent(page, agentId);

    expect((await fetchAgent(request, agentId)).systemPrompt).toBe(typed);
  });

  test('saves an untouched legacy prompt byte for byte', async ({
    page,
    request,
  }) => {
    const legacyPrompt =
      '<rules>\nUse snake_case names.\n</rules>\n\n* item one\n* item two\n\n{{input}}';
    const agentId = await seedAgent(request, {
      systemPrompt: legacyPrompt,
      context: '<facts>\n* a_b\n</facts>',
    });
    await page.goto(`/agent/${agentId}`);
    await expect(promptField(page, INSTRUCTIONS_LABEL)).toBeVisible();
    await saveAgent(page, agentId);

    const saved = await fetchAgent(request, agentId);
    expect(saved.systemPrompt).toBe(legacyPrompt);
    expect(saved.context).toBe('<facts>\n* a_b\n</facts>');
  });

  test('runs no script and keeps no javascript link when opening hostile markup', async ({
    page,
    request,
  }) => {
    const agentId = await seedAgent(request, {
      systemPrompt:
        '<img src=x onerror="window.__promptXss=1">\n\n[click](javascript:window.__promptXss=1)',
    });
    await page.goto(`/agent/${agentId}`);
    await expect(promptField(page, INSTRUCTIONS_LABEL)).toBeVisible();
    await page.waitForLoadState('networkidle');

    expect(await page.evaluate(() => Reflect.get(window, '__promptXss'))).toBe(
      undefined,
    );
    const hrefs = await page
      .locator('.ProseMirror a')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    for (const href of hrefs) {
      expect(href ?? '').not.toMatch(/^\s*javascript:/i);
    }
  });
});

test.describe('raw view', () => {
  const storedPrompt = '# Title\n\n<rules>\nbe kind\n</rules>';

  test('shows the stored text exactly', async ({ page, request }) => {
    const agentId = await seedAgent(request, { systemPrompt: storedPrompt });
    await page.goto(`/agent/${agentId}`);

    await showRawView(page);

    await expect(promptField(page, INSTRUCTIONS_LABEL)).toHaveValue(
      storedPrompt,
    );
  });

  test('saves raw edits exactly as typed', async ({ page, request }) => {
    const agentId = await seedAgent(request, { systemPrompt: storedPrompt });
    const typed = '<plan>\n  keep   spacing\n</plan>\n\n\n2 * 3 \\ `x`';
    await page.goto(`/agent/${agentId}`);
    await showRawView(page);

    await promptField(page, INSTRUCTIONS_LABEL).fill(typed);
    await saveAgent(page, agentId);

    expect((await fetchAgent(request, agentId)).systemPrompt).toBe(typed);
  });

  test('shows raw edits formatted after switching back', async ({
    page,
    request,
  }) => {
    const agentId = await seedAgent(request, { systemPrompt: storedPrompt });
    await page.goto(`/agent/${agentId}`);
    await showRawView(page);

    await promptField(page, INSTRUCTIONS_LABEL).fill('## Changed heading');
    await showFormattedView(page);

    await expect(
      page.getByRole('heading', { name: 'Changed heading', level: 2 }),
    ).toBeVisible();
  });

  test('opens every prompt field in the raw view once chosen', async ({
    page,
    request,
  }) => {
    const agentId = await seedAgent(request, {
      systemPrompt: storedPrompt,
      context: '<facts>one</facts>',
    });
    await page.goto(`/agent/${agentId}`);
    await showRawView(page);

    await page.getByRole('tab', { name: 'Context' }).click();
    await expect(promptField(page, 'Background knowledge')).toHaveValue(
      '<facts>one</facts>',
    );

    await page.reload();
    await expect(promptField(page, INSTRUCTIONS_LABEL)).toHaveValue(
      storedPrompt,
    );
  });
});

test.describe('field controls', () => {
  test('turns the current line into a heading from the format menu', async ({
    page,
    request,
  }) => {
    const agentId = await seedAgent(request);
    await page.goto(`/agent/${agentId}`);
    await replaceFormattedText(promptField(page, INSTRUCTIONS_LABEL), 'Role');

    await page.getByRole('button', { name: 'Format' }).click();
    await page.getByRole('menuitem', { name: 'Heading 2' }).click();
    await saveAgent(page, agentId);

    expect((await fetchAgent(request, agentId)).systemPrompt).toBe('## Role');
  });

  test('edits the same value in the expanded side panel', async ({
    page,
    request,
  }) => {
    const agentId = await seedAgent(request, { systemPrompt: 'alpha' });
    await page.goto(`/agent/${agentId}`);

    await page.getByRole('button', { name: 'Expand' }).click();
    const panel = page.getByRole('dialog', { name: INSTRUCTIONS_LABEL });
    const panelField = panel.getByRole('textbox', { name: INSTRUCTIONS_LABEL });
    await panelField.click();
    await panelField.press('ControlOrMeta+End');
    await panelField.pressSequentially(' beta');
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await saveAgent(page, agentId);

    expect((await fetchAgent(request, agentId)).systemPrompt).toBe(
      'alpha beta',
    );
  });
});

test.describe('prompt length limit', () => {
  test('shows the character count and updates it with every change', async ({
    page,
    request,
  }) => {
    const agentId = await seedAgent(request, { systemPrompt: '' });
    await page.goto(`/agent/${agentId}`);
    const count = page.locator('#panel-persona').getByText(/\/ 30,000$/);
    await expect(count).toHaveText('0 / 30,000');

    await replaceFormattedText(promptField(page, INSTRUCTIONS_LABEL), 'abc');
    await expect(count).toHaveText('3 / 30,000');

    await showRawView(page);
    await promptField(page, INSTRUCTIONS_LABEL).fill('abcde');
    await expect(count).toHaveText('5 / 30,000');
  });

  test('flags a prompt over the limit, keeps all text and blocks saving', async ({
    page,
    request,
  }) => {
    const agentId = await seedAgent(request, { systemPrompt: 'short' });
    const patchRequests: string[] = [];
    page.on('request', (outgoing) => {
      if (outgoing.method() === 'PATCH') patchRequests.push(outgoing.url());
    });
    await page.goto(`/agent/${agentId}`);
    await showRawView(page);

    const field = promptField(page, INSTRUCTIONS_LABEL);
    await field.fill('a'.repeat(PROMPT_LIMIT + 1));
    await page.getByText(INSTRUCTIONS_LABEL).click();

    const count = page.getByText('30,001 / 30,000');
    await expect(count).toBeVisible();
    await expect(count).toHaveClass(/text-destructive/);
    await expect(
      page.getByText('Use at most 30,000 characters.'),
    ).toBeVisible();
    expect((await field.inputValue()).length).toBe(PROMPT_LIMIT + 1);

    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForLoadState('networkidle');
    expect(patchRequests).toEqual([]);
    expect((await fetchAgent(request, agentId)).systemPrompt).toBe('short');
  });
});

test.describe('workflow node prompts', () => {
  const nodeTypes = ['agent', 'team'] as const;

  for (const type of nodeTypes) {
    test(`saves {{input}} unchanged in ${type === 'agent' ? 'an agent' : 'a team'} node prompt`, async ({
      page,
      request,
    }) => {
      const workflowId = await seedWorkflow(request, [
        { id: 'node-1', type, label: 'Only step', prompt: 'old', x: 300 },
      ]);
      await page.goto(`/workflow/${workflowId}`);
      await page.getByText('Only step', { exact: true }).click();

      await replaceFormattedText(
        promptField(page, 'Prompt'),
        'Summarize {{input}} in snake_case',
      );
      await saveWorkflow(page, workflowId);

      const prompt = await fetchNodePrompt(request, workflowId, 'node-1');
      expect(prompt).toContain('Summarize {{input}} in snake_case');
    });
  }

  test('shows the prompt of the selected node when switching nodes', async ({
    page,
    request,
  }) => {
    const workflowId = await seedWorkflow(request, [
      {
        id: 'node-1',
        type: 'agent',
        label: 'First step',
        prompt: 'alpha prompt',
        x: 300,
      },
      {
        id: 'node-2',
        type: 'agent',
        label: 'Second step',
        prompt: 'beta prompt',
        x: 700,
      },
    ]);
    await page.goto(`/workflow/${workflowId}`);

    await page.getByText('First step', { exact: true }).click();
    await expect(promptField(page, 'Prompt')).toHaveText('alpha prompt');

    await page.getByText('Second step', { exact: true }).click();
    await expect(promptField(page, 'Prompt')).toHaveText('beta prompt');
  });

  test('flags a node prompt over the limit with its own message', async ({
    page,
    request,
  }) => {
    const workflowId = await seedWorkflow(request, [
      {
        id: 'node-1',
        type: 'agent',
        label: 'Only step',
        prompt: 'short',
        x: 300,
      },
    ]);
    await page.goto(`/workflow/${workflowId}`);
    await page.getByText('Only step', { exact: true }).click();
    await showRawView(page);

    await promptField(page, 'Prompt').fill('a'.repeat(PROMPT_LIMIT + 1));

    await expect(
      page.getByText('Use at most 30,000 characters.'),
    ).toBeVisible();
    await expect(page.getByText('Enter a prompt.')).toHaveCount(0);
    await expect(page.getByText('30,001 / 30,000')).toHaveClass(
      /text-destructive/,
    );
  });

  test('shows the prompt error when the prompt is cleared', async ({
    page,
    request,
  }) => {
    const workflowId = await seedWorkflow(request, []);
    await page.goto(`/workflow/${workflowId}`);
    await page.getByRole('button', { name: 'Agent', exact: true }).click();

    await replaceFormattedText(promptField(page, 'Prompt'), '');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByText('Enter a prompt.')).toBeVisible();
  });

  test('shows the prompt error when the prompt is cleared in the raw view', async ({
    page,
    request,
  }) => {
    const workflowId = await seedWorkflow(request, []);
    await page.goto(`/workflow/${workflowId}`);
    await page.getByRole('button', { name: 'Agent', exact: true }).click();
    await showRawView(page);

    await promptField(page, 'Prompt').fill('');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByText('Enter a prompt.')).toBeVisible();
  });
});
