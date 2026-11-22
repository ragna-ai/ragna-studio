import { createTask, createWorkflow, db, publishWorkflow, sql } from '@repo/database';
import { agentContextDocument, aiModel } from '@repo/database/schema';
import { resetProviderMocks, seedTokenPricedAiModel, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import {
  agentRoutes,
  createAgent,
  expectProblem,
  seedLockTeam,
  usageSchema,
  type LockTeam,
} from './agent-lock-fixtures';

async function seedLockedAgent(body: Record<string, unknown> = {}) {
  const team = await seedLockTeam();
  const agentId = await createAgent(team.editor, { aiModelId: team.aiModelId, ...body });
  const routes = agentRoutes({ workspaceId: team.workspaceId, agentId });
  return { team, agentId, routes };
}

async function lock(routes: ReturnType<typeof agentRoutes>, team: LockTeam) {
  const response = await routes.lock(team.editor);
  expect(response.status).toBe(StatusCodes.OK);
}

async function storedAgent(agentId: string) {
  return db.query.agent.findFirst({ where: { id: agentId } });
}

async function createDataset(team: LockTeam): Promise<string> {
  const response = await app.request(`/workspace/${team.workspaceId}/dataset`, {
    method: 'POST',
    headers: { cookie: team.editor.cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Leads',
      columns: [{ id: 'col-name', name: 'Name', type: 'text' }],
    }),
  });
  return z.object({ dataset: z.object({ id: z.string() }) }).parse(await response.json()).dataset
    .id;
}

describe('editing a locked agent', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test.each([
    ['system prompt', { systemPrompt: 'Something else.' }],
    ['context', { context: 'New background.' }],
    ['tool grants', { toolGrants: [{ id: 'webSearch' }] }],
    ['settings', { settings: { maxOutputTokens: 500 } }],
  ])('refuses a changed %s and keeps the stored value', async (_label, change) => {
    const { team, agentId, routes } = await seedLockedAgent();
    await lock(routes, team);
    const before = await storedAgent(agentId);

    const response = await routes.patch(team.editor, change);

    await expectProblem(response, StatusCodes.CONFLICT, 'agent-locked');
    expect(await storedAgent(agentId)).toEqual(before);
  });

  test('refuses a changed model', async () => {
    const { team, routes } = await seedLockedAgent();
    await lock(routes, team);
    const { aiModelId: otherModelId } = await seedTokenPricedAiModel();

    const response = await routes.patch(team.editor, { aiModelId: otherModelId });

    await expectProblem(response, StatusCodes.CONFLICT, 'agent-locked');
  });

  test('refuses a changed default dataset', async () => {
    const { team, routes } = await seedLockedAgent();
    await lock(routes, team);
    const datasetId = await createDataset(team);

    const response = await routes.patch(team.editor, { defaultDatasetId: datasetId });

    await expectProblem(response, StatusCodes.CONFLICT, 'agent-locked');
  });

  test('saves a new name, description, icon and tone', async () => {
    const { team, agentId, routes } = await seedLockedAgent();
    await lock(routes, team);

    const response = await routes.patch(team.editor, {
      name: 'Renamed',
      description: 'Now described',
      icon: 'invoice-01',
      tone: 'plum',
    });

    expect(response.status).toBe(StatusCodes.OK);
    const stored = await storedAgent(agentId);
    expect(stored?.name).toBe('Renamed');
    expect(stored?.description).toBe('Now described');
    expect(stored?.icon).toBe('invoice-01');
  });

  test('saves a form that repeats every locked field unchanged, with the grants not in id order', async () => {
    const grants = [{ id: 'webSearch' }, { id: 'think' }];
    const { team, agentId, routes } = await seedLockedAgent({
      toolGrants: grants,
      context: 'Background.',
      settings: { maxOutputTokens: 800 },
    });
    await lock(routes, team);
    const stored = await storedAgent(agentId);

    const response = await routes.patch(team.editor, {
      name: 'Renamed',
      aiModelId: stored?.aiModelId,
      systemPrompt: stored?.systemPrompt,
      context: stored?.context,
      toolGrants: grants,
      defaultDatasetId: stored?.defaultDatasetId,
      settings: stored?.settings,
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect((await storedAgent(agentId))?.name).toBe('Renamed');
  });

  test('a save racing a lock either lands before it or is refused, never half applied', async () => {
    const { team, agentId, routes } = await seedLockedAgent();

    const [patchResponse] = await Promise.all([
      routes.patch(team.editor, { systemPrompt: 'Racing prompt.' }),
      routes.lock(team.editor),
    ]);

    expect([StatusCodes.OK, StatusCodes.CONFLICT]).toContain(patchResponse.status);
    const stored = await storedAgent(agentId);
    const version = await db.query.agentVersion.findFirst({ where: { agentId } });
    expect(version?.config.systemPrompt).toBe(stored?.systemPrompt ?? '');
  });

  test('deleting the default dataset still clears it from a locked agent', async () => {
    const team = await seedLockTeam();
    const datasetId = await createDataset(team);
    const agentId = await createAgent(team.editor, {
      aiModelId: team.aiModelId,
      defaultDatasetId: datasetId,
    });
    const routes = agentRoutes({ workspaceId: team.workspaceId, agentId });
    await lock(routes, team);

    const response = await app.request(`/workspace/${team.workspaceId}/dataset/${datasetId}`, {
      method: 'DELETE',
      headers: { cookie: team.editor.cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect((await storedAgent(agentId))?.defaultDatasetId).toBeNull();
  });
});

describe('knowledge files and the lock', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  async function addKnowledgeFile(
    agentId: string,
    status: 'pending' | 'ready' | 'failed',
  ): Promise<string> {
    const [row] = await db
      .insert(agentContextDocument)
      .values({
        agentId,
        name: 'notes.txt',
        storageKey: `agents/${agentId}/notes`,
        mimeType: 'text/plain',
        fileSize: 5,
        status,
      })
      .returning({ id: agentContextDocument.id });
    return row?.id ?? '';
  }

  function documentsPath(team: LockTeam, agentId: string, suffix = ''): string {
    return `/workspace/${team.workspaceId}/agent/${agentId}/context-document${suffix}`;
  }

  test.each(['pending', 'failed'] as const)(
    'locking is refused while a knowledge file is %s',
    async (status) => {
      const { team, agentId, routes } = await seedLockedAgent();
      await addKnowledgeFile(agentId, status);

      const response = await routes.lock(team.editor);

      await expectProblem(response, StatusCodes.CONFLICT, 'knowledge-files-not-ready');
      expect((await storedAgent(agentId))?.lockedVersionId).toBeNull();
    },
  );

  test('approving is refused while a knowledge file is pending', async () => {
    const { team, agentId, routes } = await seedLockedAgent();
    await addKnowledgeFile(agentId, 'pending');

    const response = await routes.approve(team.manager);

    await expectProblem(response, StatusCodes.CONFLICT, 'knowledge-files-not-ready');
  });

  test('the version records the knowledge files it was locked with', async () => {
    const { team, agentId, routes } = await seedLockedAgent();
    const documentId = await addKnowledgeFile(agentId, 'ready');

    await lock(routes, team);

    const version = await db.query.agentVersion.findFirst({ where: { agentId } });
    expect(version?.knowledgeDocumentIds).toEqual([documentId]);
  });

  test('a locked agent refuses an upload, a replacement, a retry and a delete of knowledge files', async () => {
    const { team, agentId, routes } = await seedLockedAgent();
    const documentId = await addKnowledgeFile(agentId, 'ready');
    await lock(routes, team);
    const headers = { cookie: team.editor.cookieHeader };
    const file = () => {
      const formData = new FormData();
      formData.append('files', new File(['text'], 'more.txt', { type: 'text/plain' }));
      return formData;
    };
    const replacement = new FormData();
    replacement.append('file', new File(['text'], 'more.txt', { type: 'text/plain' }));

    const responses = await Promise.all([
      app.request(documentsPath(team, agentId), { method: 'POST', headers, body: file() }),
      app.request(documentsPath(team, agentId, `/${documentId}/file`), {
        method: 'PUT',
        headers,
        body: replacement,
      }),
      app.request(documentsPath(team, agentId, `/${documentId}/retry`), {
        method: 'POST',
        headers,
      }),
      app.request(documentsPath(team, agentId, `/${documentId}`), { method: 'DELETE', headers }),
    ]);

    for (const response of responses) {
      await expectProblem(response, StatusCodes.CONFLICT, 'agent-locked');
    }
    expect(await db.query.agentContextDocument.findMany({ where: { agentId } })).toHaveLength(1);
  });

  test('a locked agent still lets a knowledge file be renamed', async () => {
    const { team, agentId, routes } = await seedLockedAgent();
    const documentId = await addKnowledgeFile(agentId, 'ready');
    await lock(routes, team);

    const response = await app.request(documentsPath(team, agentId, `/${documentId}`), {
      method: 'PATCH',
      headers: { cookie: team.editor.cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'renamed.txt' }),
    });

    expect(response.status).toBe(StatusCodes.OK);
  });
});

describe('deleting an agent', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('a locked agent cannot be deleted', async () => {
    const { team, agentId, routes } = await seedLockedAgent();
    await lock(routes, team);

    const response = await routes.remove(team.owner);

    await expectProblem(response, StatusCodes.CONFLICT, 'agent-locked');
    expect(await storedAgent(agentId)).toBeDefined();
  });

  test('an unlocked agent that was locked before is deleted and its versions stay behind', async () => {
    const { team, agentId, routes } = await seedLockedAgent();
    await lock(routes, team);
    await routes.unlock(team.editor);

    const response = await routes.remove(team.editor);

    expect(response.status).toBe(StatusCodes.OK);
    const versions = await db.query.agentVersion.findMany({
      where: { workspaceId: team.workspaceId },
    });
    expect(versions).toHaveLength(1);
    expect(versions[0]?.agentId).toBeNull();
    expect(await storedAgent(agentId)).toBeUndefined();
  });
});

describe('removing the AI model of a locked agent', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('deletes the agent with the model and keeps its versions without an agent', async () => {
    const { team, routes } = await seedLockedAgent();
    await lock(routes, team);

    await db.delete(aiModel).where(sql`${aiModel.id} = ${team.aiModelId}`);

    const versions = await db.query.agentVersion.findMany({
      where: { workspaceId: team.workspaceId },
    });
    expect(versions).toHaveLength(1);
    expect(versions[0]?.agentId).toBeNull();
  });
});

describe('agent usage', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('counts open assigned tasks and published workflows, not finished tasks or drafts', async () => {
    const { team, agentId, routes } = await seedLockedAgent();
    const openStatuses = ['backlog', 'todo', 'in_progress', 'in_review'] as const;
    for (const status of [...openStatuses, 'done', 'canceled'] as const) {
      await createTask({
        workspaceId: team.workspaceId,
        title: status,
        status,
        assignedAgentId: agentId,
      });
    }
    await createTask({ workspaceId: team.workspaceId, title: 'Unassigned' });
    const definition = {
      nodes: [
        {
          id: 'agent-1',
          type: 'agent' as const,
          position: { x: 0, y: 0 },
          data: { label: 'Agent', config: { agentId, prompt: 'Do it' } },
        },
      ],
      edges: [],
    };
    const published = await createWorkflow({
      userId: team.editor.userId,
      workspaceId: team.workspaceId,
      name: 'Published',
      definition,
    });
    await publishWorkflow({ workflowId: published.id, workspaceId: team.workspaceId });
    await createWorkflow({
      userId: team.editor.userId,
      workspaceId: team.workspaceId,
      name: 'Draft only',
      definition,
    });

    const response = await routes.usage(team.editor);

    expect(response.status).toBe(StatusCodes.OK);
    expect(usageSchema.parse(await response.json())).toEqual({
      workflowCount: 1,
      assignedTaskCount: openStatuses.length,
    });
  });

  test('is zero for an agent nobody uses', async () => {
    const { team, routes } = await seedLockedAgent();

    const response = await routes.usage(team.editor);

    expect(usageSchema.parse(await response.json())).toEqual({
      workflowCount: 0,
      assignedTaskCount: 0,
    });
  });

  test('an unknown agent answers not found', async () => {
    const { team } = await seedLockedAgent();
    const routes = agentRoutes({
      workspaceId: team.workspaceId,
      agentId: Bun.randomUUIDv7(),
    });

    const response = await routes.usage(team.editor);

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});
