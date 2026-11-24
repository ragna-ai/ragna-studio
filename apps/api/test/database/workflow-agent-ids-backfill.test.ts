import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, sql } from '@repo/database';
import { workflow } from '@repo/database/schema';
import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { getWorkflowAgentIds, type WorkflowDefinition } from '@repo/workflow';
import { beforeEach, describe, expect, test } from 'bun:test';

const BACKFILL_SQL = readFileSync(
  join(
    import.meta.dir,
    '../../../../packages/database/drizzle/20261122153523_workflow_agent_ids_backfill/migration.sql',
  ),
  'utf8',
);

const POSITION = { x: 0, y: 0 };

function agentNode(id: string, agentId: string): WorkflowDefinition['nodes'][number] {
  return {
    id,
    type: 'agent',
    position: POSITION,
    data: { label: id, config: { agentId, prompt: 'Do it.' } },
  };
}

function teamNode(
  id: string,
  leadAgentId: string,
  memberIds: string[],
): WorkflowDefinition['nodes'][number] {
  return {
    id,
    type: 'team',
    position: POSITION,
    data: {
      label: id,
      config: {
        mode: 'delegate',
        leadAgentId,
        prompt: 'Do it.',
        members: memberIds.map((agentId) => ({ agentId, role: '' })),
      },
    },
  };
}

const transformNode: WorkflowDefinition['nodes'][number] = {
  id: 'transform',
  type: 'transform',
  position: POSITION,
  data: { label: 'transform', config: { template: '{{input}}' } },
};

function definitionOf(nodes: WorkflowDefinition['nodes']): WorkflowDefinition {
  return { nodes, edges: [] };
}

beforeEach(async () => {
  await truncateAllTables();
});

async function backfill(
  rows: { published: WorkflowDefinition | null; draft?: WorkflowDefinition }[],
) {
  const { userId, personalWorkspaceId } = await seedAuthenticatedUser();
  const ids: string[] = [];
  for (const row of rows) {
    const [inserted] = await db
      .insert(workflow)
      .values({
        userId,
        workspaceId: personalWorkspaceId,
        name: 'Flow',
        definition: row.draft ?? row.published ?? definitionOf([]),
        publishedDefinition: row.published,
      })
      .returning({ id: workflow.id });
    ids.push(inserted?.id ?? '');
  }
  await db.update(workflow).set({ agentIds: [] });
  await db.execute(sql.raw(BACKFILL_SQL));
  const saved: string[][] = [];
  for (const id of ids) {
    const found = await db.query.workflow.findFirst({
      columns: { agentIds: true },
      where: { id },
    });
    saved.push(found?.agentIds ?? []);
  }
  return saved;
}

describe('workflow agent ids backfill', () => {
  test('collects the agent of an agent node', async () => {
    const published = definitionOf([agentNode('a', 'agent-1')]);
    const [ids] = await backfill([{ published }]);
    expect(new Set(ids)).toEqual(new Set(['agent-1']));
  });

  test('collects the lead and every member of a team node', async () => {
    const published = definitionOf([teamNode('t', 'lead', ['m1', 'm2'])]);
    const [ids] = await backfill([{ published }]);
    expect(new Set(ids)).toEqual(new Set(['lead', 'm1', 'm2']));
  });

  test('keeps a duplicate agent id once', async () => {
    const published = definitionOf([
      agentNode('a', 'agent-1'),
      agentNode('b', 'agent-1'),
      teamNode('t', 'agent-1', ['m1']),
    ]);
    const [ids] = await backfill([{ published }]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids)).toEqual(new Set(['agent-1', 'm1']));
  });

  test('leaves a workflow without agent nodes empty', async () => {
    const [ids] = await backfill([{ published: definitionOf([transformNode]) }]);
    expect(ids).toEqual([]);
  });

  test('ignores the draft of an unpublished workflow', async () => {
    const [ids] = await backfill([
      { published: null, draft: definitionOf([agentNode('a', 'agent-1')]) },
    ]);
    expect(ids).toEqual([]);
  });

  test('ignores the draft of a published workflow', async () => {
    const [ids] = await backfill([
      {
        published: definitionOf([agentNode('a', 'agent-1')]),
        draft: definitionOf([agentNode('a', 'agent-2')]),
      },
    ]);
    expect(new Set(ids)).toEqual(new Set(['agent-1']));
  });

  test('matches getWorkflowAgentIds for every published definition', async () => {
    const definitions = [
      definitionOf([agentNode('a', 'agent-1')]),
      definitionOf([teamNode('t', 'lead', ['m1', 'm2'])]),
      definitionOf([
        agentNode('a', 'x'),
        agentNode('b', 'x'),
        teamNode('t', 'x', ['y']),
        transformNode,
      ]),
      definitionOf([transformNode]),
    ];
    const saved = await backfill(definitions.map((published) => ({ published })));
    definitions.forEach((definition, index) => {
      expect(new Set(saved[index])).toEqual(new Set(getWorkflowAgentIds(definition)));
    });
  });
});
