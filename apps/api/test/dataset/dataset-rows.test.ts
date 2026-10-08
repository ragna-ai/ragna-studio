import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// Plain CRUD + reorder for /workspace/:workspaceId/dataset/:datasetId/row.
// Auth/authorization are covered exhaustively in test/auth/;
// this file only checks the dataset row feature's own behavior.

const datasetRowSchema = z.object({
  id: z.string(),
  datasetId: z.string(),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
});

const rowListResponseSchema = z.object({ rows: z.array(datasetRowSchema) });
const rowResponseSchema = z.object({ row: datasetRowSchema });

const nameColumn = { id: 'col-name', name: 'Name', type: 'text' as const };

async function createDataset(cookieHeader: string, workspaceId: string) {
  const response = await app.request(`/workspace/${workspaceId}/dataset`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Leads', columns: [nameColumn] }),
  });
  const body = z.object({ dataset: z.object({ id: z.string() }) }).parse(await response.json());
  return body.dataset.id;
}

async function createRow(cookieHeader: string, workspaceId: string, datasetId: string, name: string) {
  const response = await app.request(`/workspace/${workspaceId}/dataset/${datasetId}/row`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ data: { [nameColumn.id]: name } }),
  });
  return rowResponseSchema.parse(await response.json()).row;
}

describe('GET /workspace/:workspaceId/dataset/:datasetId/row', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('starts empty for a new dataset', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const datasetId = await createDataset(cookieHeader, workspaceId);

    const response = await app.request(`/workspace/${workspaceId}/dataset/${datasetId}/row`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = rowListResponseSchema.parse(await response.json());
    expect(body.rows).toEqual([]);
  });

  test('lists rows in dataset order (creation order by default)', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const datasetId = await createDataset(cookieHeader, workspaceId);
    await createRow(cookieHeader, workspaceId, datasetId, 'Ada');
    await createRow(cookieHeader, workspaceId, datasetId, 'Bob');
    await createRow(cookieHeader, workspaceId, datasetId, 'Cy');

    const response = await app.request(`/workspace/${workspaceId}/dataset/${datasetId}/row`, {
      headers: { cookie: cookieHeader },
    });
    const body = rowListResponseSchema.parse(await response.json());
    expect(body.rows.map((row) => row.data[nameColumn.id])).toEqual(['Ada', 'Bob', 'Cy']);
  });
});

describe('POST /workspace/:workspaceId/dataset/:datasetId/row', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('appends a row with the given data', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const datasetId = await createDataset(cookieHeader, workspaceId);

    const row = await createRow(cookieHeader, workspaceId, datasetId, 'Ada');

    expect(row.datasetId).toBe(datasetId);
    expect(row.data[nameColumn.id]).toBe('Ada');
  });
});

describe('PATCH /workspace/:workspaceId/dataset/:datasetId/row/:rowId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('updates the row data', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const datasetId = await createDataset(cookieHeader, workspaceId);
    const row = await createRow(cookieHeader, workspaceId, datasetId, 'Ada');

    const response = await app.request(
      `/workspace/${workspaceId}/dataset/${datasetId}/row/${row.id}`,
      {
        method: 'PATCH',
        headers: { cookie: cookieHeader, 'content-type': 'application/json' },
        body: JSON.stringify({ data: { [nameColumn.id]: 'Ada Lovelace' } }),
      },
    );

    expect(response.status).toBe(StatusCodes.OK);
    const body = rowResponseSchema.parse(await response.json());
    expect(body.row.data[nameColumn.id]).toBe('Ada Lovelace');
  });

  test('404s for a row id that does not exist', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const datasetId = await createDataset(cookieHeader, workspaceId);
    const row = await createRow(cookieHeader, workspaceId, datasetId, 'Ada');
    await app.request(`/workspace/${workspaceId}/dataset/${datasetId}/row/${row.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    const response = await app.request(
      `/workspace/${workspaceId}/dataset/${datasetId}/row/${row.id}`,
      {
        method: 'PATCH',
        headers: { cookie: cookieHeader, 'content-type': 'application/json' },
        body: JSON.stringify({ data: { [nameColumn.id]: 'Ghost' } }),
      },
    );

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('DELETE /workspace/:workspaceId/dataset/:datasetId/row/:rowId', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('soft deletes: the row disappears from the list', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const datasetId = await createDataset(cookieHeader, workspaceId);
    const kept = await createRow(cookieHeader, workspaceId, datasetId, 'Ada');
    const removed = await createRow(cookieHeader, workspaceId, datasetId, 'Bob');

    const deleteResponse = await app.request(
      `/workspace/${workspaceId}/dataset/${datasetId}/row/${removed.id}`,
      { method: 'DELETE', headers: { cookie: cookieHeader } },
    );
    expect(deleteResponse.status).toBe(StatusCodes.OK);

    const listResponse = await app.request(`/workspace/${workspaceId}/dataset/${datasetId}/row`, {
      headers: { cookie: cookieHeader },
    });
    const body = rowListResponseSchema.parse(await listResponse.json());
    expect(body.rows.map((row) => row.id)).toEqual([kept.id]);
  });
});

describe('POST /workspace/:workspaceId/dataset/:datasetId/row/:rowId/move', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('reorders a row after a given row', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const datasetId = await createDataset(cookieHeader, workspaceId);
    const ada = await createRow(cookieHeader, workspaceId, datasetId, 'Ada');
    const bob = await createRow(cookieHeader, workspaceId, datasetId, 'Bob');
    const cy = await createRow(cookieHeader, workspaceId, datasetId, 'Cy');

    // Starts Ada, Bob, Cy. Move Ada to after Cy: Bob, Cy, Ada.
    const moveResponse = await app.request(
      `/workspace/${workspaceId}/dataset/${datasetId}/row/${ada.id}/move`,
      {
        method: 'POST',
        headers: { cookie: cookieHeader, 'content-type': 'application/json' },
        body: JSON.stringify({ afterRowId: cy.id }),
      },
    );
    expect(moveResponse.status).toBe(StatusCodes.OK);

    const listResponse = await app.request(`/workspace/${workspaceId}/dataset/${datasetId}/row`, {
      headers: { cookie: cookieHeader },
    });
    const body = rowListResponseSchema.parse(await listResponse.json());
    expect(body.rows.map((row) => row.id)).toEqual([bob.id, cy.id, ada.id]);
  });
});
