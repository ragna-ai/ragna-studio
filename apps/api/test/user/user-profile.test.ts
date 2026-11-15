import { db } from '@repo/database';
import { seedAuthenticatedUser, truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

const userProfileResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
  }),
});

const localeResponseSchema = z.object({ user: z.object({ locale: z.string().nullable() }) });

function patchProfile(cookieHeader: string, body: object) {
  return app.request('/user/profile', {
    method: 'PATCH',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /user/profile', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('returns the authenticated user for a valid session cookie', async () => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request('/user/profile', {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);

    const body = userProfileResponseSchema.parse(await response.json());
    expect(body.user.id).toBe(userId);
  });

  test('rejects the request when no session cookie is sent', async () => {
    const response = await app.request('/user/profile');

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });
});

describe('PATCH /user/profile language', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('stores the chosen language and returns it on the next read', async () => {
    const { cookieHeader } = await seedAuthenticatedUser();

    const response = await patchProfile(cookieHeader, { locale: 'en' });

    expect(response.status).toBe(StatusCodes.OK);
    expect(localeResponseSchema.parse(await response.json()).user.locale).toBe('en');
    const read = await app.request('/user/profile', { headers: { cookie: cookieHeader } });
    expect(localeResponseSchema.parse(await read.json()).user.locale).toBe('en');
  });

  test.each([['xx'], [null]])('rejects the language %p and keeps the stored one', async (value) => {
    const { userId, cookieHeader } = await seedAuthenticatedUser();
    await patchProfile(cookieHeader, { locale: 'de' });

    const response = await patchProfile(cookieHeader, { locale: value });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    const row = await db.query.user.findFirst({ where: { id: userId } });
    expect(row?.locale).toBe('de');
  });
});
