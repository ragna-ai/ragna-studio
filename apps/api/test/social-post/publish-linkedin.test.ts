import { problemDetailsSchema, problemTypeUri } from '@repo/api-errors';
import { createMedia, createSocialPostMediaRecords, db } from '@repo/database';
import { NOTIFY_USER_JOB, parseNotifyUserJob } from '@repo/queue';
import {
  enqueuedJobs,
  failVendorEndpoint,
  LINKEDIN_ENDPOINTS,
  recordVendorSleep,
  resetProviderMocks,
  seedAuthenticatedUser,
  seedLinkedinConnection,
  truncateAllTables,
  vendorHttp,
  vendorRequestsTo,
  type VendorRequest,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';
import { publishSocialPost } from '../../src/services/social-post.service';
import { resetEmailQueueMock } from '../email/support/email-queue.mock';

const MAX_WAIT_POLLS_SLEEP_MS = 1500;

const postSchema = z.object({ status: z.string() });
const postResponseSchema = z.object({ post: postSchema });
const createdSchema = z.object({ post: z.object({ id: z.string() }) });

const createPostBodySchema = z.object({
  content: z
    .object({
      media: z.object({ id: z.string(), altText: z.string().optional() }).optional(),
      multiImage: z
        .object({ images: z.array(z.object({ id: z.string(), altText: z.string().optional() })) })
        .optional(),
    })
    .optional(),
});

beforeEach(async () => {
  await truncateAllTables();
  resetProviderMocks();
  resetEmailQueueMock();
});

interface PublishSetup {
  userId: string;
  workspaceId: string;
  cookieHeader: string;
  socialPostId: string;
}

async function setupDraft(): Promise<PublishSetup> {
  const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
  const created = await app.request(`/workspace/${workspaceId}/social-post`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'Ready to publish' }),
  });
  const { post } = createdSchema.parse(await created.json());
  return { userId, workspaceId, cookieHeader, socialPostId: post.id };
}

async function attachImages({
  workspaceId,
  socialPostId,
  userId,
  altTexts,
}: PublishSetup & { altTexts: (string | null)[] }): Promise<void> {
  for (const [sortOrder, altText] of altTexts.entries()) {
    const media = await createMedia({
      ownerWorkspaceId: workspaceId,
      bucket: 'images',
      storageKey: `${userId}/social/photo-${sortOrder}.png`,
      filename: `photo-${sortOrder}.png`,
      mimeType: 'image/png',
      size: 10,
      origin: 'uploaded',
    });
    await createSocialPostMediaRecords([
      {
        socialPostId,
        mediaId: media.id,
        mimeType: 'image/png',
        origin: 'upload',
        altText,
        sortOrder,
      },
    ]);
  }
}

function publishOverHttp({ workspaceId, socialPostId, cookieHeader }: PublishSetup) {
  return app.request(`/workspace/${workspaceId}/social-post/${socialPostId}/publish`, {
    method: 'POST',
    headers: { cookie: cookieHeader },
  });
}

function publishWithRecordedSleep({ workspaceId, socialPostId, userId }: PublishSetup) {
  return publishSocialPost({ workspaceId, socialPostId, userId, sleep: recordVendorSleep });
}

async function readPostStatus({ workspaceId, socialPostId, cookieHeader }: PublishSetup) {
  const response = await app.request(`/workspace/${workspaceId}/social-post/${socialPostId}`, {
    headers: { cookie: cookieHeader },
  });
  return postResponseSchema.parse(await response.json()).post.status;
}

function readCreatePostBody(request: VendorRequest | undefined) {
  return createPostBodySchema.parse(JSON.parse(request?.body ?? '{}'));
}

function expectNoLinkedinRequests(): void {
  expect(vendorHttp.requests).toHaveLength(0);
}

async function expectLinkedinNotConnected(response: Response): Promise<void> {
  expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  const problem = problemDetailsSchema.parse(await response.json());
  expect(problem.type).toBe(problemTypeUri('linkedin-not-connected'));
}

describe('publishing respects the LinkedIn connection', () => {
  test('answers linkedin-not-connected without calling LinkedIn when posting is turned off', async () => {
    const setup = await setupDraft();
    await seedLinkedinConnection({ userId: setup.userId, enabledIntegrations: [] });

    const response = await publishOverHttp(setup);

    await expectLinkedinNotConnected(response);
    expectNoLinkedinRequests();
  });

  test('answers linkedin-not-connected without calling LinkedIn when the posting permission is missing', async () => {
    const setup = await setupDraft();
    await seedLinkedinConnection({
      userId: setup.userId,
      scopes: ['openid', 'profile', 'email'],
    });

    const response = await publishOverHttp(setup);

    await expectLinkedinNotConnected(response);
    expectNoLinkedinRequests();
  });

  test('answers linkedin-not-connected and keeps the draft when LinkedIn rejects the access', async () => {
    const setup = await setupDraft();
    await seedLinkedinConnection({ userId: setup.userId });
    failVendorEndpoint(LINKEDIN_ENDPOINTS.createPost, { status: 401 });

    const response = await publishOverHttp(setup);

    await expectLinkedinNotConnected(response);
    expect(await readPostStatus(setup)).toBe('draft');
  });

  test('flags the connection as needing a reconnect and notifies the owner when LinkedIn rejects the access', async () => {
    const setup = await setupDraft();
    const { connection } = await seedLinkedinConnection({ userId: setup.userId });
    failVendorEndpoint(LINKEDIN_ENDPOINTS.createPost, { status: 401 });

    await publishOverHttp(setup);

    const stored = await db.query.integrationConnection.findFirst();
    expect(stored?.status).toBe('needs_reauth');
    const notifications = enqueuedJobs(NOTIFY_USER_JOB).map(([, data]) => parseNotifyUserJob(data));
    expect(notifications).toEqual([
      {
        userId: setup.userId,
        type: 'integration_needs_reauth',
        data: { connectionId: connection.id, provider: 'linkedin' },
      },
    ]);
  });
});

describe('publishing retries a busy LinkedIn safely', () => {
  test('publishes after LinkedIn asks to wait once', async () => {
    const setup = await setupDraft();
    await seedLinkedinConnection({ userId: setup.userId });
    failVendorEndpoint(LINKEDIN_ENDPOINTS.createPost, {
      status: 429,
      headers: { 'Retry-After': '2' },
      times: 1,
    });

    const result = await publishWithRecordedSleep(setup);

    expect(result.linkedinNotConnected).toBe(false);
    expect(vendorHttp.sleeps).toEqual([2000]);
    expect(vendorRequestsTo(LINKEDIN_ENDPOINTS.createPost)).toHaveLength(2);
  });

  test('sends the create request once and fails the post when LinkedIn answers a server error', async () => {
    const setup = await setupDraft();
    await seedLinkedinConnection({ userId: setup.userId });
    failVendorEndpoint(LINKEDIN_ENDPOINTS.createPost, { status: 503 });

    const response = await publishOverHttp(setup);

    expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(vendorRequestsTo(LINKEDIN_ENDPOINTS.createPost)).toHaveLength(1);
    expect(await readPostStatus(setup)).toBe('failed');
  });

  test('publishes with an image after LinkedIn answers one server error while registering it', async () => {
    const setup = await setupDraft();
    await seedLinkedinConnection({ userId: setup.userId });
    await attachImages({ ...setup, altTexts: [null] });
    failVendorEndpoint(LINKEDIN_ENDPOINTS.initializeUpload, { status: 503, times: 1 });

    const result = await publishWithRecordedSleep(setup);

    expect(result.linkedinNotConnected).toBe(false);
    expect(vendorRequestsTo(LINKEDIN_ENDPOINTS.initializeUpload)).toHaveLength(2);
    expect(vendorRequestsTo(LINKEDIN_ENDPOINTS.createPost)).toHaveLength(1);
  });
});

describe('publishing reports image processing failures', () => {
  test('fails the post without creating it when LinkedIn reports the image as failed', async () => {
    const setup = await setupDraft();
    await seedLinkedinConnection({ userId: setup.userId });
    await attachImages({ ...setup, altTexts: [null] });
    failVendorEndpoint(LINKEDIN_ENDPOINTS.imageStatus, {
      status: 200,
      body: { status: 'PROCESSING_FAILED' },
    });

    const response = await publishOverHttp(setup);

    expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(vendorRequestsTo(LINKEDIN_ENDPOINTS.createPost)).toHaveLength(0);
    expect(await readPostStatus(setup)).toBe('failed');
  });

  test('fails the post after the wait limit when LinkedIn never finishes processing the image', async () => {
    const setup = await setupDraft();
    await seedLinkedinConnection({ userId: setup.userId });
    await attachImages({ ...setup, altTexts: [null] });
    failVendorEndpoint(LINKEDIN_ENDPOINTS.imageStatus, {
      status: 200,
      body: { status: 'PROCESSING' },
    });

    await expect(publishWithRecordedSleep(setup)).rejects.toThrow('Failed to publish to LinkedIn');

    expect(vendorHttp.sleeps.length).toBeGreaterThan(0);
    expect(vendorHttp.sleeps.every((ms) => ms === MAX_WAIT_POLLS_SLEEP_MS)).toBe(true);
    expect(vendorRequestsTo(LINKEDIN_ENDPOINTS.createPost)).toHaveLength(0);
    expect(await readPostStatus(setup)).toBe('failed');
  });
});

describe('the LinkedIn post body', () => {
  test('has no content for a text post', async () => {
    const setup = await setupDraft();
    await seedLinkedinConnection({ userId: setup.userId });

    await publishOverHttp(setup);

    const [request] = vendorRequestsTo(LINKEDIN_ENDPOINTS.createPost);
    expect(readCreatePostBody(request).content).toBeUndefined();
  });

  test('sends one image as media with its alt text, uploaded with the bearer token', async () => {
    const setup = await setupDraft();
    const { accessToken } = await seedLinkedinConnection({ userId: setup.userId });
    await attachImages({ ...setup, altTexts: ['A red bicycle'] });

    const response = await publishOverHttp(setup);

    expect(response.status).toBe(StatusCodes.OK);
    const [request] = vendorRequestsTo(LINKEDIN_ENDPOINTS.createPost);
    const content = readCreatePostBody(request).content;
    expect(content?.media?.altText).toBe('A red bicycle');
    expect(content?.multiImage).toBeUndefined();
    const [upload] = vendorRequestsTo(LINKEDIN_ENDPOINTS.uploadImage);
    expect(upload?.headers.get('Authorization')).toBe(`Bearer ${accessToken}`);
    expect(upload?.headers.get('Content-Type')).toBe('image/png');
  });

  test('sends two images as a multi image post', async () => {
    const setup = await setupDraft();
    await seedLinkedinConnection({ userId: setup.userId });
    await attachImages({ ...setup, altTexts: [null, null] });

    const response = await publishOverHttp(setup);

    expect(response.status).toBe(StatusCodes.OK);
    const [request] = vendorRequestsTo(LINKEDIN_ENDPOINTS.createPost);
    const content = readCreatePostBody(request).content;
    expect(content?.multiImage?.images).toHaveLength(2);
    expect(content?.media).toBeUndefined();
  });
});
