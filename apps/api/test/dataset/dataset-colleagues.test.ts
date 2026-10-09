import { db } from '@repo/database';
import {
  seedAuthenticatedUser,
  deleteSeededUser,
  seedOrganizationMember,
  truncateAllTables,
  type SeededAuthenticatedUser,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// Datasets are shared work: any workspace member may append and reorder rows.

const nameColumn = { id: 'col-name', name: 'Name', type: 'text' as const };
const rowSchema = z.strictObject({
  id: z.string(),
  datasetId: z.string(),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  sortOrder: z.string(),
  writtenBy: z.string(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const rowResponseSchema = z.object({ row: rowSchema });

interface Colleagues {
  author: SeededAuthenticatedUser;
  colleague: SeededAuthenticatedUser;
  datasetId: string;
}

async function seedSharedDataset(): Promise<Colleagues> {
  const author = await seedAuthenticatedUser();
  const membership = await db.query.member.findFirst({ where: { userId: author.userId } });
  const colleague = await seedOrganizationMember({
    organizationId: membership?.organizationId ?? '',
    role: 'member',
  });

  const response = await app.request(`/workspace/${author.workspaceId}/dataset`, {
    method: 'POST',
    headers: { cookie: author.cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Leads', columns: [nameColumn] }),
  });
  const body = z.object({ dataset: z.object({ id: z.string() }) }).parse(await response.json());
  return { author, colleague, datasetId: body.dataset.id };
}

function createRow(user: SeededAuthenticatedUser, datasetId: string, name: string) {
  return app.request(`/workspace/${user.workspaceId}/dataset/${datasetId}/row`, {
    method: 'POST',
    headers: { cookie: user.cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ data: { [nameColumn.id]: name } }),
  });
}

beforeEach(async () => {
  await truncateAllTables();
});

describe('dataset rows written by a colleague', () => {
  test("appends a row to the author's dataset", async () => {
    const { colleague, datasetId } = await seedSharedDataset();

    const response = await createRow(colleague, datasetId, 'Ada');

    expect(response.status).toBe(StatusCodes.CREATED);
    expect(rowResponseSchema.parse(await response.json()).row.data[nameColumn.id]).toBe('Ada');
  });

  test("reorders a row of the author's dataset", async () => {
    const { author, colleague, datasetId } = await seedSharedDataset();
    const ada = rowResponseSchema.parse(await (await createRow(author, datasetId, 'Ada')).json());
    const bob = rowResponseSchema.parse(await (await createRow(author, datasetId, 'Bob')).json());

    const response = await app.request(
      `/workspace/${colleague.workspaceId}/dataset/${datasetId}/row/${ada.row.id}/move`,
      {
        method: 'POST',
        headers: { cookie: colleague.cookieHeader, 'content-type': 'application/json' },
        body: JSON.stringify({ afterRowId: bob.row.id }),
      },
    );

    expect(response.status).toBe(StatusCodes.OK);
    const listResponse = await app.request(
      `/workspace/${author.workspaceId}/dataset/${datasetId}/row`,
      { headers: { cookie: author.cookieHeader } },
    );
    const { rows } = z.object({ rows: z.array(rowSchema) }).parse(await listResponse.json());
    expect(rows.map((row) => row.id)).toEqual([bob.row.id, ada.row.id]);
  });

  test('appends and reorders after the author was deleted', async () => {
    const { author, colleague } = await seedSharedDataset();
    const membership = await db.query.member.findFirst({ where: { userId: author.userId } });
    const formerMember = await seedOrganizationMember({
      organizationId: membership?.organizationId ?? '',
      role: 'member',
    });
    const response = await app.request(`/workspace/${formerMember.workspaceId}/dataset`, {
      method: 'POST',
      headers: { cookie: formerMember.cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Orphaned', columns: [nameColumn] }),
    });
    const { dataset } = z
      .object({ dataset: z.object({ id: z.string() }) })
      .parse(await response.json());
    const datasetId = dataset.id;
    const ada = rowResponseSchema.parse(
      await (await createRow(colleague, datasetId, 'Ada')).json(),
    );
    await deleteSeededUser({ userId: formerMember.userId });

    const append = await createRow(colleague, datasetId, 'Bob');
    const move = await app.request(
      `/workspace/${colleague.workspaceId}/dataset/${datasetId}/row/${ada.row.id}/move`,
      {
        method: 'POST',
        headers: { cookie: colleague.cookieHeader, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      },
    );

    expect(append.status).toBe(StatusCodes.CREATED);
    expect(move.status).toBe(StatusCodes.OK);
  });
});
