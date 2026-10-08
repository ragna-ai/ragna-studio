import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// Plain CRUD for /workspace/:workspaceId/dataset. Row endpoints live in dataset-rows.test.ts.
// Auth/authorization are covered exhaustively in test/auth/; this file only
// checks the dataset feature's own behavior.

const datasetColumnSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['text', 'number', 'date', 'select']),
});

const datasetSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  columns: z.array(datasetColumnSchema),
});

const datasetWithRowCountSchema = datasetSchema.extend({ rowCount: z.number() });

const datasetListResponseSchema = z.object({
  datasets: z.array(datasetWithRowCountSchema),
  meta: z.object({ totalCount: z.number() }),
});
const datasetResponseSchema = z.object({ dataset: datasetSchema });

const nameColumn = { id: 'col-name', name: 'Name', type: 'text' as const };

async function createDataset(
  cookieHeader: string,
  workspaceId: string,
  body: Record<string, unknown> = { name: 'Leads', columns: [nameColumn] },
) {
  const response = await app.request(`/workspace/${workspaceId}/dataset`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    dataset: datasetResponseSchema.parse(await response.json()).dataset,
  };
}

describe('GET /workspace/:workspaceId/dataset', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('starts empty for a new workspace', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/dataset`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = datasetListResponseSchema.parse(await response.json());
    expect(body.datasets).toEqual([]);
    expect(body.meta.totalCount).toBe(0);
  });

  test('paginates, newest first by default', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    for (const name of ['First', 'Second', 'Third']) {
      await createDataset(cookieHeader, workspaceId, { name });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const response = await app.request(`/workspace/${workspaceId}/dataset?page=1&limit=2`, {
      headers: { cookie: cookieHeader },
    });
    const body = datasetListResponseSchema.parse(await response.json());

    expect(body.meta.totalCount).toBe(3);
    expect(body.datasets.map((dataset) => dataset.name)).toEqual(['Third', 'Second']);
  });
});

describe('POST /workspace/:workspaceId/dataset', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('creates a dataset with its columns', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const { status, dataset } = await createDataset(cookieHeader, workspaceId, {
      name: 'Leads',
      columns: [nameColumn],
    });

    expect(status).toBe(StatusCodes.CREATED);
    expect(dataset.name).toBe('Leads');
    expect(dataset.columns).toEqual([nameColumn]);
  });

  test('rejects an empty name', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/dataset`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });
});

describe('GET /workspace/:workspaceId/dataset/:datasetId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('404s for a dataset id that does not exist', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { dataset } = await createDataset(cookieHeader, workspaceId);
    await app.request(`/workspace/${workspaceId}/dataset/${dataset.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    const response = await app.request(`/workspace/${workspaceId}/dataset/${dataset.id}`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('PATCH /workspace/:workspaceId/dataset/:datasetId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('updates name, description, and columns', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { dataset } = await createDataset(cookieHeader, workspaceId);

    const response = await app.request(`/workspace/${workspaceId}/dataset/${dataset.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed', description: 'New description' }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = datasetResponseSchema.parse(await response.json());
    expect(body.dataset.name).toBe('Renamed');
    expect(body.dataset.description).toBe('New description');
  });
});

describe('DELETE /workspace/:workspaceId/dataset/:datasetId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('deletes the dataset and its rows cascade', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { dataset } = await createDataset(cookieHeader, workspaceId);
    await app.request(`/workspace/${workspaceId}/dataset/${dataset.id}/row`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ data: { [nameColumn.id]: 'Ada' } }),
    });

    const deleteResponse = await app.request(`/workspace/${workspaceId}/dataset/${dataset.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });
    expect(deleteResponse.status).toBe(StatusCodes.OK);

    const listResponse = await app.request(`/workspace/${workspaceId}/dataset`, {
      headers: { cookie: cookieHeader },
    });
    const body = datasetListResponseSchema.parse(await listResponse.json());
    expect(body.datasets).toEqual([]);
  });
});

describe('GET /workspace/:workspaceId/dataset/:datasetId/export', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('downloads a CSV with a matching filename and content type', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { dataset } = await createDataset(cookieHeader, workspaceId, {
      name: 'Leads',
      columns: [nameColumn],
    });
    await app.request(`/workspace/${workspaceId}/dataset/${dataset.id}/row`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ data: { [nameColumn.id]: 'Ada' } }),
    });

    const response = await app.request(
      `/workspace/${workspaceId}/dataset/${dataset.id}/export?format=csv`,
      { headers: { cookie: cookieHeader } },
    );

    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers.get('content-type')).toContain('csv');
    expect(response.headers.get('content-disposition')).toContain('leads-');

    const text = await response.text();
    expect(text).toContain('Name');
    expect(text).toContain('Ada');
  });
});
