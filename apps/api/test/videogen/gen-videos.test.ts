import type { NewGenVideo } from '@repo/database';
import { createGenVideoRecord } from '@repo/database';
import { getVideoGenBucketNameForUser } from '@repo/storage';
import {
  deleteObjectsMock,
  resetProviderMocks,
  seedAuthenticatedUser,
  truncateAllTables,
  uploadObjectBufferMock,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// videogen (docs/testing/strategy.md's "Blocked on mock infrastructure",
// now unblocked). Auth/authorization are covered exhaustively in test/auth/
// and test/workspace/workspace-authorization.test.ts; this file only checks
// the videogen feature's own behavior.
//
// Unlike imagegen, the create route (`generateVideoForWorkspace` ->
// `requestGenVideo`, @repo/ai) never calls the `ai` package: it only
// inserts a pending row and enqueues a BullMQ job against the real docker
// Redis (docs/testing/strategy.md's "External boundaries" treats Redis as
// real, not mocked). The actual Veo call
// (`runGenVideo`/`generateAndUploadVideo`) only runs from apps/worker's
// gen-video processor, out of scope here, so no `ai` mock is needed for
// this file. The frame-upload route does need the storage mock.

const genVideoSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  aspectRatio: z.string(),
  resolution: z.string(),
  model: z.string(),
});

const genVideoResponseSchema = z.object({ genVideo: genVideoSchema });
const listResponseSchema = z.object({
  genVideos: z.array(genVideoSchema),
  meta: z.object({ totalCount: z.number() }),
});

// The render is done by apps/worker's gen-video processor (out of scope
// here, see the top-of-file comment), so a "completed" row with a
// storageKey/frameStorageKey is seeded directly via the repo rather than
// waiting on a real render.
function seedCompletedVideo(
  overrides: Partial<NewGenVideo> & Pick<NewGenVideo, 'userId' | 'workspaceId'>,
) {
  return createGenVideoRecord({
    prompt: 'a drone shot over a city',
    provider: 'google-vertex',
    model: 'veo-3.1-generate-001',
    status: 'completed',
    ...overrides,
  });
}

describe('GET /workspace/:workspaceId/gen-video', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('rejects the request when no session cookie is sent', async () => {
    const response = await app.request('/workspace/any-workspace-id/gen-video');

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  test('starts empty for a new workspace', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/gen-video`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = listResponseSchema.parse(await response.json());
    expect(body.genVideos).toEqual([]);
  });
});

describe('POST /workspace/:workspaceId/gen-video', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('requests a video generation and it shows up pending in the list', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/gen-video`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: 'a drone shot over a city',
        provider: 'google-vertex',
        model: 'veo-3.1-generate-001',
      }),
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    const body = genVideoResponseSchema.parse(await response.json());
    expect(body.genVideo.status).toBe('pending');
    expect(body.genVideo.prompt).toBe('a drone shot over a city');

    const listResponse = await app.request(`/workspace/${workspaceId}/gen-video`, {
      headers: { cookie: cookieHeader },
    });
    const listBody = listResponseSchema.parse(await listResponse.json());
    expect(listBody.genVideos.map((video) => video.id)).toEqual([body.genVideo.id]);
  });

  test('rejects 1080p for a 9:16 video', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/gen-video`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: 'a portrait video',
        provider: 'google-vertex',
        model: 'veo-3.1-generate-001',
        aspectRatio: '9:16',
        resolution: '1080p',
      }),
    });

    expect(response.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
  });
});

describe('POST /workspace/:workspaceId/gen-video/frame-upload', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('uploads a first-frame image through the faked storage client', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const formData = new FormData();
    formData.append(
      'file',
      new File([new Uint8Array([1, 2, 3])], 'frame.png', { type: 'image/png' }),
    );

    const response = await app.request(`/workspace/${workspaceId}/gen-video/frame-upload`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
      body: formData,
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    const body = z.object({ storageKey: z.string().min(1) }).parse(await response.json());
    expect(body.storageKey).toContain('videos/frames');
    expect(uploadObjectBufferMock).toHaveBeenCalledTimes(1);
  });

  test('rejects an unsupported file type', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const formData = new FormData();
    formData.append(
      'file',
      new File([new Uint8Array([1, 2, 3])], 'frame.txt', { type: 'text/plain' }),
    );

    const response = await app.request(`/workspace/${workspaceId}/gen-video/frame-upload`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
      body: formData,
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });
});

describe('DELETE /workspace/:workspaceId/gen-video/:genVideoId', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('rejects the request when no session cookie is sent', async () => {
    const response = await app.request(
      '/workspace/any-workspace-id/gen-video/019fb2d8-0000-7000-8000-000000000000',
      { method: 'DELETE' },
    );

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  test('404s for a genVideoId that does not exist', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(
      `/workspace/${workspaceId}/gen-video/019fb2d8-0000-7000-8000-000000000000`,
      { method: 'DELETE', headers: { cookie: cookieHeader } },
    );

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('404s for a genVideoId that belongs to another workspace', async () => {
    const owner = await seedAuthenticatedUser();
    const video = await seedCompletedVideo({
      userId: owner.userId,
      workspaceId: owner.workspaceId,
      storageKey: `${owner.userId}/videos/generated/owned.mp4`,
    });
    const otherUser = await seedAuthenticatedUser();

    const response = await app.request(
      `/workspace/${otherUser.workspaceId}/gen-video/${video.id}`,
      { method: 'DELETE', headers: { cookie: otherUser.cookieHeader } },
    );

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(deleteObjectsMock).not.toHaveBeenCalled();
  });

  test('deletes a pending video with no rendered object yet, without touching R2', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const video = await seedCompletedVideo({ userId, workspaceId, status: 'pending' });

    const response = await app.request(`/workspace/${workspaceId}/gen-video/${video.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(deleteObjectsMock).not.toHaveBeenCalled();

    const listResponse = await app.request(`/workspace/${workspaceId}/gen-video`, {
      headers: { cookie: cookieHeader },
    });
    const listBody = listResponseSchema.parse(await listResponse.json());
    expect(listBody.genVideos).toEqual([]);
  });

  test('deletes the row and both its own rendered clip and uploaded frame from R2', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const storageKey = `${userId}/videos/generated/clip.mp4`;
    const frameStorageKey = `${userId}/videos/frames/frame.png`;
    const video = await seedCompletedVideo({
      userId,
      workspaceId,
      storageKey,
      frameOrigin: 'upload',
      frameStorageKey,
    });
    const { bucketName } = getVideoGenBucketNameForUser(userId);

    const response = await app.request(`/workspace/${workspaceId}/gen-video/${video.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(deleteObjectsMock).toHaveBeenCalledTimes(1);
    expect(deleteObjectsMock.mock.calls[0]).toEqual([bucketName, [storageKey, frameStorageKey]]);
  });

  test("leaves a 'genImage'-origin frame's object alone, since it belongs to that image row", async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const storageKey = `${userId}/videos/generated/clip.mp4`;
    const imageStorageKey = `${userId}/images/generated/source.png`;
    const video = await seedCompletedVideo({
      userId,
      workspaceId,
      storageKey,
      frameOrigin: 'genImage',
      frameStorageKey: imageStorageKey,
    });
    const { bucketName } = getVideoGenBucketNameForUser(userId);

    const response = await app.request(`/workspace/${workspaceId}/gen-video/${video.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(deleteObjectsMock).toHaveBeenCalledTimes(1);
    expect(deleteObjectsMock.mock.calls[0]).toEqual([bucketName, [storageKey]]);
  });

  test('still deletes the row when the R2 delete fails (best-effort cleanup)', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const video = await seedCompletedVideo({
      userId,
      workspaceId,
      storageKey: `${userId}/videos/generated/clip.mp4`,
    });

    deleteObjectsMock.mockImplementationOnce(() => {
      throw new Error('R2 is down');
    });

    const response = await app.request(`/workspace/${workspaceId}/gen-video/${video.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);

    const listResponse = await app.request(`/workspace/${workspaceId}/gen-video`, {
      headers: { cookie: cookieHeader },
    });
    const listBody = listResponseSchema.parse(await listResponse.json());
    expect(listBody.genVideos).toEqual([]);
  });
});
