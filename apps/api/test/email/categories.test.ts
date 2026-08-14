import { resetProviderMocks, seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { seedConnectedGmailAccount } from './support/email-fixtures';
import { resetEmailQueueMock } from './support/email-queue.mock';
import { resetMailProviderMock } from './support/mail-provider.mock';

// Email categories + auto-draft senders (docs/email/prd.md, "Auto-categorize
// incoming mail" / "Auto-draft replies"). Both are per-account CRUD with a
// uniqueness constraint scoped to the account (email.schema.ts's
// emailCategory_accountId_name_idx / emailAutoDraftSender_accountId_
// senderEmail_idx).

beforeEach(async () => {
  await truncateAllTables();
  resetProviderMocks();
  resetMailProviderMock();
  resetEmailQueueMock();
});

async function connectAccount() {
  const { userId, cookieHeader } = await seedAuthenticatedUser();
  await seedConnectedGmailAccount({ userId, cookieHeader });
  return { userId, cookieHeader };
}

const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  color: z.string(),
  autoDraft: z.boolean(),
});

describe('POST /email/category', () => {
  test('creates a category with defaults', async () => {
    const { cookieHeader } = await connectAccount();

    const response = await app.request('/email/category', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Invoices', color: '#00ff00' }),
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    const body = z.object({ category: categorySchema }).parse(await response.json());
    expect(body.category.name).toBe('Invoices');
    expect(body.category.description).toBe('');
    expect(body.category.autoDraft).toBe(false);
  });

  test('rejects a duplicate name on the same account', async () => {
    const { cookieHeader } = await connectAccount();
    const create = () =>
      app.request('/email/category', {
        method: 'POST',
        headers: { cookie: cookieHeader, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Invoices', color: '#00ff00' }),
      });

    expect((await create()).status).toBe(StatusCodes.CREATED);
    const second = await create();
    expect(second.status).toBe(StatusCodes.BAD_REQUEST);
  });

  test('rejects an invalid color', async () => {
    const { cookieHeader } = await connectAccount();

    const response = await app.request('/email/category', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Invoices', color: 'not-a-color' }),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });
});

describe('PATCH /email/category/:categoryId', () => {
  test('updates fields and toggles autoDraft', async () => {
    const { cookieHeader } = await connectAccount();
    const created = await app.request('/email/category', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Invoices', color: '#00ff00' }),
    });
    const { category } = z.object({ category: categorySchema }).parse(await created.json());

    const response = await app.request(`/email/category/${category.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ autoDraft: true, description: 'Billing stuff' }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = z.object({ category: categorySchema }).parse(await response.json());
    expect(body.category.autoDraft).toBe(true);
    expect(body.category.description).toBe('Billing stuff');
  });

  test('404s for a category id that does not belong to this account', async () => {
    const { cookieHeader } = await connectAccount();

    const response = await app.request('/email/category/019fb2d8-0000-7000-8000-000000000000', {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed' }),
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('DELETE /email/category/:categoryId', () => {
  test('removes the category', async () => {
    const { cookieHeader } = await connectAccount();
    const created = await app.request('/email/category', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Invoices', color: '#00ff00' }),
    });
    const { category } = z.object({ category: categorySchema }).parse(await created.json());

    const response = await app.request(`/email/category/${category.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });
    expect(response.status).toBe(StatusCodes.OK);

    const listResponse = await app.request('/email/category', { headers: { cookie: cookieHeader } });
    const listBody = z.object({ categories: z.array(categorySchema) }).parse(await listResponse.json());
    expect(listBody.categories.find((c) => c.id === category.id)).toBeUndefined();
  });
});

const senderSchema = z.object({ id: z.string(), senderEmail: z.string() });

describe('POST /email/auto-draft-sender', () => {
  test('adds a sender', async () => {
    const { cookieHeader } = await connectAccount();

    const response = await app.request('/email/auto-draft-sender', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ senderEmail: 'vip@example.test' }),
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    const body = z.object({ sender: senderSchema }).parse(await response.json());
    expect(body.sender.senderEmail).toBe('vip@example.test');
  });

  test('rejects a duplicate sender on the same account', async () => {
    const { cookieHeader } = await connectAccount();
    const add = () =>
      app.request('/email/auto-draft-sender', {
        method: 'POST',
        headers: { cookie: cookieHeader, 'content-type': 'application/json' },
        body: JSON.stringify({ senderEmail: 'vip@example.test' }),
      });

    expect((await add()).status).toBe(StatusCodes.CREATED);
    expect((await add()).status).toBe(StatusCodes.BAD_REQUEST);
  });

  test('rejects an invalid email', async () => {
    const { cookieHeader } = await connectAccount();

    const response = await app.request('/email/auto-draft-sender', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ senderEmail: 'not-an-email' }),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });
});

describe('DELETE /email/auto-draft-sender/:senderId', () => {
  test('removes the sender', async () => {
    const { cookieHeader } = await connectAccount();
    const created = await app.request('/email/auto-draft-sender', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ senderEmail: 'vip@example.test' }),
    });
    const { sender } = z.object({ sender: senderSchema }).parse(await created.json());

    const response = await app.request(`/email/auto-draft-sender/${sender.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });
    expect(response.status).toBe(StatusCodes.OK);

    const listResponse = await app.request('/email/auto-draft-sender', { headers: { cookie: cookieHeader } });
    const listBody = z.object({ senders: z.array(senderSchema) }).parse(await listResponse.json());
    expect(listBody.senders).toHaveLength(0);
  });

  test('404s for a sender id that does not exist', async () => {
    const { cookieHeader } = await connectAccount();

    const response = await app.request('/email/auto-draft-sender/019fb2d8-0000-7000-8000-000000000000', {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});
