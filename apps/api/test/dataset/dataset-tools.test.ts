import {
  datasetAppendRowDefinition,
  datasetCreateDefinition,
  datasetFindDefinition,
  datasetGetRowDefinition,
  datasetListRowsDefinition,
  datasetMoveRowDefinition,
  datasetUpdateRowDefinition,
  type ToolContext,
} from '@repo/ai';
import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import * as z from 'zod';

const failureSchema = z.strictObject({ status: z.string(), message: z.string() });
const rowSchema = z.strictObject({
  id: z.string(),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  writtenBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const rowResultSchema = z.strictObject({ row: rowSchema });
const datasetResultSchema = z.strictObject({
  dataset: z.strictObject({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    columns: z.array(
      z.strictObject({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        options: z.array(z.string()).optional(),
      }),
    ),
  }),
});

const statusColumn = {
  id: 'status',
  name: 'Status',
  type: 'select' as const,
  options: ['todo', 'done'],
};
const MISSING_ID = 'does-not-exist';

async function seedContext(): Promise<ToolContext> {
  const { userId, workspaceId } = await seedAuthenticatedUser();
  return { userId, workspaceId, origin: 'agent' };
}

async function createDataset(ctx: ToolContext): Promise<string> {
  const result = await datasetCreateDefinition.execute(
    { name: 'Plan', columns: [statusColumn] },
    ctx,
  );
  return datasetResultSchema.parse(result).dataset.id;
}

async function appendRow(ctx: ToolContext, datasetId: string, status: string): Promise<string> {
  const result = await datasetAppendRowDefinition.execute({ datasetId, data: { status } }, ctx);
  return rowResultSchema.parse(result).row.id;
}

describe('dataset tool failures', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('create rejects duplicate column ids as invalid_input', async () => {
    const ctx = await seedContext();

    const result = await datasetCreateDefinition.execute(
      { name: 'Plan', columns: [statusColumn, statusColumn] },
      ctx,
    );

    expect(failureSchema.parse(result)).toEqual({
      status: 'invalid_input',
      message: 'Duplicate column id "status"',
    });
  });

  test('listRows reports an unknown dataset as not_found', async () => {
    const ctx = await seedContext();

    const result = await datasetListRowsDefinition.execute({ datasetId: MISSING_ID }, ctx);

    expect(failureSchema.parse(result).status).toBe('not_found');
  });

  test('listRows rejects unknown projected columns as invalid_input', async () => {
    const ctx = await seedContext();
    const datasetId = await createDataset(ctx);

    const result = await datasetListRowsDefinition.execute({ datasetId, columns: ['nope'] }, ctx);

    expect(failureSchema.parse(result)).toEqual({
      status: 'invalid_input',
      message: 'Unknown column ids: nope.',
    });
  });

  test('getRow reports a missing row as not_found', async () => {
    const ctx = await seedContext();
    const datasetId = await createDataset(ctx);

    const result = await datasetGetRowDefinition.execute({ datasetId, rowId: MISSING_ID }, ctx);

    expect(failureSchema.parse(result)).toEqual({ status: 'not_found', message: 'Row not found.' });
  });

  test('appendRow rejects an out-of-range select value as invalid_input', async () => {
    const ctx = await seedContext();
    const datasetId = await createDataset(ctx);

    const result = await datasetAppendRowDefinition.execute(
      { datasetId, data: { status: 'blocked' } },
      ctx,
    );

    expect(failureSchema.parse(result).status).toBe('invalid_input');
  });

  test('appendRow rejects an unknown column as invalid_input', async () => {
    const ctx = await seedContext();
    const datasetId = await createDataset(ctx);

    const result = await datasetAppendRowDefinition.execute(
      { datasetId, data: { nope: 'x' } },
      ctx,
    );

    expect(failureSchema.parse(result)).toEqual({
      status: 'invalid_input',
      message: 'Unknown column "nope"',
    });
  });

  test('updateRow reports a missing row as not_found and bad values as invalid_input', async () => {
    const ctx = await seedContext();
    const datasetId = await createDataset(ctx);
    const rowId = await appendRow(ctx, datasetId, 'todo');

    const missing = await datasetUpdateRowDefinition.execute(
      { datasetId, rowId: MISSING_ID, data: { status: 'done' } },
      ctx,
    );
    const invalid = await datasetUpdateRowDefinition.execute(
      { datasetId, rowId, data: { status: 'blocked' } },
      ctx,
    );

    expect(failureSchema.parse(missing).status).toBe('not_found');
    expect(failureSchema.parse(invalid).status).toBe('invalid_input');
  });

  test('moveRow reports a missing row or anchor as not_found and a self anchor as invalid_input', async () => {
    const ctx = await seedContext();
    const datasetId = await createDataset(ctx);
    const rowId = await appendRow(ctx, datasetId, 'todo');

    const missingRow = await datasetMoveRowDefinition.execute(
      { datasetId, rowId: MISSING_ID },
      ctx,
    );
    const missingAnchor = await datasetMoveRowDefinition.execute(
      { datasetId, rowId, afterRowId: MISSING_ID },
      ctx,
    );
    const selfAnchor = await datasetMoveRowDefinition.execute(
      { datasetId, rowId, afterRowId: rowId },
      ctx,
    );

    expect(failureSchema.parse(missingRow).status).toBe('not_found');
    expect(failureSchema.parse(missingAnchor).status).toBe('not_found');
    expect(failureSchema.parse(selfAnchor).status).toBe('invalid_input');
  });

  test('a dataset of another workspace is not_found', async () => {
    const owner = await seedContext();
    const datasetId = await createDataset(owner);
    const stranger = await seedContext();

    const result = await datasetAppendRowDefinition.execute(
      { datasetId, data: { status: 'todo' } },
      stranger,
    );

    expect(failureSchema.parse(result).status).toBe('not_found');
  });

  test('find falls back to all datasets when the query matches nothing', async () => {
    const ctx = await seedContext();
    await createDataset(ctx);

    const result = await datasetFindDefinition.execute({ query: 'zzz' }, ctx);

    const parsed = z
      .strictObject({ datasets: z.array(z.unknown()), note: z.string() })
      .parse(result);
    expect(parsed.datasets).toHaveLength(1);
  });
});
