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
