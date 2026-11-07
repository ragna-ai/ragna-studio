import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, sql } from '@repo/database';
import { agent, agentTemplate } from '@repo/database/schema';
import { seedAuthenticatedUser, seedTokenPricedAiModel, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';

const BACKFILL_SQL = readFileSync(
  join(
    import.meta.dir,
    '../../../../packages/database/drizzle/20261107123659_agent_tool_grants_backfill/migration.sql',
  ),
  'utf8',
);

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

class RollbackSignal extends Error {}

beforeEach(async () => {
  await truncateAllTables();
});

/**
 * Runs `work` in a transaction that has the pre-contract columns, then rolls it back.
 * The test database is built from the current schema, which no longer has them.
 */
async function withOldColumns<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  let result: { value: T } | undefined;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`ALTER TABLE agents ADD COLUMN tools jsonb NOT NULL DEFAULT '[]', ADD COLUMN integration_tools jsonb NOT NULL DEFAULT '{}'`,
      );
      await tx.execute(
        sql`ALTER TABLE agent_templates ADD COLUMN tools jsonb NOT NULL DEFAULT '[]'`,
      );
      result = { value: await work(tx) };
      throw new RollbackSignal();
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) {
      throw error;
    }
  }
  if (!result) {
    throw new Error('transaction did not complete');
  }
  return result.value;
}

interface OldAgentColumns {
  tools: string[];
  integrationTools: Record<string, string>;
  toolGrants?: { id: string; access?: string }[];
}

async function backfillAgent(old: OldAgentColumns) {
  const { userId, personalWorkspaceId } = await seedAuthenticatedUser();
  const { aiModelId } = await seedTokenPricedAiModel();
  return withOldColumns(async (tx) => {
    const [row] = await tx
      .insert(agent)
      .values({
        userId,
        workspaceId: personalWorkspaceId,
        aiModelId,
        name: 'Agent',
        systemPrompt: 'Be concise.',
        toolGrants: old.toolGrants ?? [],
      })
      .returning({ id: agent.id });
    await tx.execute(
      sql`UPDATE agents SET tools = ${JSON.stringify(old.tools)}::jsonb, integration_tools = ${JSON.stringify(old.integrationTools)}::jsonb WHERE id = ${row?.id ?? ''}`,
    );
    await tx.execute(sql.raw(BACKFILL_SQL));
    const [saved] = await tx.select({ toolGrants: agent.toolGrants }).from(agent);
    return saved?.toolGrants;
  });
}

async function backfillTemplate(tools: string[]) {
  const { aiModelId } = await seedTokenPricedAiModel();
  return withOldColumns(async (tx) => {
    const [row] = await tx
      .insert(agentTemplate)
      .values({ aiModelId, name: 'Starter', systemPrompt: 'Be concise.' })
      .returning({ id: agentTemplate.id });
    await tx.execute(
      sql`UPDATE agent_templates SET tools = ${JSON.stringify(tools)}::jsonb WHERE id = ${row?.id ?? ''}`,
    );
    await tx.execute(sql.raw(BACKFILL_SQL));
    const [saved] = await tx.select({ toolGrants: agentTemplate.toolGrants }).from(agentTemplate);
    return saved?.toolGrants;
  });
}

describe('agent tool grants backfill', () => {
  test('turns built-in tools into grants in their old order', async () => {
    const grants = await backfillAgent({ tools: ['memory', 'think'], integrationTools: {} });
    expect(grants).toEqual([{ id: 'memory' }, { id: 'think' }]);
  });

  test('turns a Google Drive level into a grant with access', async () => {
    const grants = await backfillAgent({ tools: [], integrationTools: { 'google-drive': 'read' } });
    expect(grants).toEqual([{ id: 'google-drive', access: 'read' }]);
  });

  test('puts built-in grants before the Google Drive grant', async () => {
    const grants = await backfillAgent({
      tools: ['tasks', 'webSearch'],
      integrationTools: { 'google-drive': 'write' },
    });
    expect(grants).toEqual([
      { id: 'tasks' },
      { id: 'webSearch' },
      { id: 'google-drive', access: 'write' },
    ]);
  });

  test('keeps a duplicate built-in tool once', async () => {
    const grants = await backfillAgent({
      tools: ['think', 'memory', 'think'],
      integrationTools: {},
    });
    expect(grants).toEqual([{ id: 'think' }, { id: 'memory' }]);
  });

  test('drops an unknown tool id and an unknown integration key', async () => {
    const grants = await backfillAgent({
      tools: ['think', 'removedTool'],
      integrationTools: { dropbox: 'read', 'google-drive': 'read' },
    });
    expect(grants).toEqual([{ id: 'think' }, { id: 'google-drive', access: 'read' }]);
  });

  test('drops an integration entry with an invalid access value', async () => {
    const grants = await backfillAgent({
      tools: ['think'],
      integrationTools: { 'google-drive': 'admin' },
    });
    expect(grants).toEqual([{ id: 'think' }]);
  });

  test('gives an agent with empty old columns an empty list', async () => {
    const grants = await backfillAgent({ tools: [], integrationTools: {} });
    expect(grants).toEqual([]);
  });

  test('overwrites grants that were already set', async () => {
    const grants = await backfillAgent({
      tools: ['datasets'],
      integrationTools: {},
      toolGrants: [{ id: 'memory' }],
    });
    expect(grants).toEqual([{ id: 'datasets' }]);
  });

  test('turns the tools of a template into grants', async () => {
    const grants = await backfillTemplate(['think', 'unknown', 'documents', 'think']);
    expect(grants).toEqual([{ id: 'think' }, { id: 'documents' }]);
  });

  test('leaves the test database without the old columns', async () => {
    await backfillAgent({ tools: [], integrationTools: {} });
    const leftover = await db.$count(
      sql`information_schema.columns`,
      sql`table_name = 'agents' AND column_name IN ('tools', 'integration_tools')`,
    );
    expect(leftover).toBe(0);
  });
});
