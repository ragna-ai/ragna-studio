import { problemDetailsSchema, problemTypeUri } from '@repo/api-errors';
import { db, sql } from '@repo/database';
import { integrationConnection, socialPost } from '@repo/database/schema';
import {
  LINKEDIN_ENDPOINTS,
  LINKEDIN_POST_ID,
  overrideVendorRoute,
  resetProviderMocks,
  seedAuthenticatedUser,
  seedLinkedinConnection,
  truncateAllTables,
  vendorEmpty,
  vendorRequestsTo,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

const STALE_CLAIM_AGE_MS = 16 * 60 * 1000;

const createdSchema = z.object({ post: z.object({ id: z.string() }) });
const statusSchema = z.object({ post: z.object({ status: z.string() }) });

beforeEach(async () => {
  await truncateAllTables();
  resetProviderMocks();
});

interface DraftSetup {
  userId: string;
  workspaceId: string;
  cookieHeader: string;
  socialPostId: string;
}

async function setupDraft(): Promise<DraftSetup> {
  const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
  const created = await app.request(`/workspace/${workspaceId}/social-post`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'Ready to publish' }),
  });
  const { post } = createdSchema.parse(await created.json());
  return { userId, workspaceId, cookieHeader, socialPostId: post.id };
}

async function setStatus(
  { socialPostId }: DraftSetup,
  status: 'publishing' | 'failed',
  ageMs: number,
): Promise<void> {
  await db
    .update(socialPost)
    .set({ status, updatedAt: new Date(Date.now() - ageMs) })
    .where(sql`${socialPost.id} = ${socialPostId}`);
}

function publish({ workspaceId, socialPostId, cookieHeader }: DraftSetup) {
  return app.request(`/workspace/${workspaceId}/social-post/${socialPostId}/publish`, {
    method: 'POST',
    headers: { cookie: cookieHeader },
  });
}

async function readStatus({ workspaceId, socialPostId, cookieHeader }: DraftSetup) {
  const response = await app.request(`/workspace/${workspaceId}/social-post/${socialPostId}`, {
    headers: { cookie: cookieHeader },
  });
  return statusSchema.parse(await response.json()).post.status;
}

async function expectPublishingConflict(response: Response): Promise<void> {
  expect(response.status).toBe(StatusCodes.CONFLICT);
  const problem = problemDetailsSchema.parse(await response.json());
  expect(problem.type).toBe(problemTypeUri('social-post-publishing'));
  expect(problem.title).toBe('Social post is being published');
}

describe('claiming a social post for publishing', () => {
  test('sends one create request and answers one 409 when two publishes run at once', async () => {
    const setup = await setupDraft();
    await seedLinkedinConnection({ userId: setup.userId });
    const createPostGate = Promise.withResolvers<void>();
    overrideVendorRoute({
      ...LINKEDIN_ENDPOINTS.createPost,
      respond: async () => {
        await createPostGate.promise;
        return vendorEmpty(201, { 'x-restli-id': LINKEDIN_POST_ID });
      },
    });

    const first = publish(setup);
    const second = publish(setup);
    const loser = await Promise.race([first, second]);
    createPostGate.resolve();
    const [firstResponse, secondResponse] = await Promise.all([first, second]);

    await expectPublishingConflict(loser);
    const winner = loser === firstResponse ? secondResponse : firstResponse;
    expect(winner.status).toBe(StatusCodes.OK);
    expect(vendorRequestsTo(LINKEDIN_ENDPOINTS.createPost)).toHaveLength(1);
    expect(await readStatus(setup)).toBe('published');
  });

  test('keeps the post claimed when LinkedIn accepted it but saving the result failed', async () => {
    const setup = await setupDraft();
    const { connection } = await seedLinkedinConnection({ userId: setup.userId });
    overrideVendorRoute({
      ...LINKEDIN_ENDPOINTS.createPost,
      respond: async () => {
        await db
          .delete(integrationConnection)
          .where(sql`${integrationConnection.id} = ${connection.id}`);
        return vendorEmpty(201, { 'x-restli-id': LINKEDIN_POST_ID });
      },
    });

    const first = await publish(setup);
    const second = await publish(setup);

    expect(first.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(await readStatus(setup)).toBe('publishing');
    await expectPublishingConflict(second);
    expect(vendorRequestsTo(LINKEDIN_ENDPOINTS.createPost)).toHaveLength(1);
  });

  test('publishes a post that has been publishing for longer than the claim window', async () => {
    const setup = await setupDraft();
    await seedLinkedinConnection({ userId: setup.userId });
    await setStatus(setup, 'publishing', STALE_CLAIM_AGE_MS);

    const response = await publish(setup);

    expect(response.status).toBe(StatusCodes.OK);
    expect(await readStatus(setup)).toBe('published');
  });

  test('answers 409 for a post that started publishing a moment ago', async () => {
    const setup = await setupDraft();
    await seedLinkedinConnection({ userId: setup.userId });
    await setStatus(setup, 'publishing', 1000);

    const response = await publish(setup);

    await expectPublishingConflict(response);
    expect(vendorRequestsTo(LINKEDIN_ENDPOINTS.createPost)).toHaveLength(0);
    expect(await readStatus(setup)).toBe('publishing');
  });

  test('refuses to delete a post while it is publishing', async () => {
    const setup = await setupDraft();
    await setStatus(setup, 'publishing', 1000);

    const response = await app.request(
      `/workspace/${setup.workspaceId}/social-post/${setup.socialPostId}`,
      { method: 'DELETE', headers: { cookie: setup.cookieHeader } },
    );

    await expectPublishingConflict(response);
    expect(await readStatus(setup)).toBe('publishing');
  });

  test('puts a failed post back to failed when LinkedIn is not connected', async () => {
    const setup = await setupDraft();
    await setStatus(setup, 'failed', 1000);

    const response = await publish(setup);

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await readStatus(setup)).toBe('failed');
  });

  test('puts a draft back to draft when LinkedIn is not connected', async () => {
    const setup = await setupDraft();

    const response = await publish(setup);

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await readStatus(setup)).toBe('draft');
  });
});
