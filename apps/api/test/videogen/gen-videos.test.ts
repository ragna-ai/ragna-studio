import type { GenVideoStatus } from '@repo/database';
import {
  createGenImageRecords,
  createGenVideoRecord,
  createMedia,
  getMediaById,
} from '@repo/database';
import type { GenVideoFrameOrigin } from '@repo/database/schema';
import { getImgGenBucketNameForUser, getVideoFrameBucketNameForUser, getVideoGenBucketNameForUser } from '@repo/storage';
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
// inserts a pending row and enqueues a BullMQ job. Enqueueing is faked by
// @repo/testing's queue mock (docs/testing/strategy.md's "External
// boundaries") rather than hitting the real docker Redis apps/worker's dev
// process also polls. The actual Veo call
// (`runGenVideo`/`generateAndUploadVideo`) only runs from apps/worker's
// gen-video processor, out of scope here, so no `ai` mock is needed for
// this file. The frame-upload route does need the storage mock.

// Smallest valid 1x1 PNG: upload validation sniffs content, not file.type.
const ONE_PX_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function pngFile(name: string): File {
  return new File([Buffer.from(ONE_PX_PNG_BASE64, 'base64')], name, { type: 'image/png' });
}

const uploadResponseSchema = z.object({ mediaId: z.string().min(1), imgUrl: z.string().min(1) });

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
// here, see the top-of-file comment), so a "completed" row with a media/
// frame media row is seeded directly via the repo rather than waiting on a
// real render. storageKey/frameStorageKey are convenience params: each one
// present mints its own media row (docs/media-library/migration-prd.md)
// before the gen_videos row is created.
async function seedCompletedVideo({
  userId,
  workspaceId,
  status = 'completed',
  storageKey,
  frameOrigin,
  frameStorageKey,
}: {
  userId: string;
  workspaceId: string;
  status?: GenVideoStatus;
  storageKey?: string;
  frameOrigin?: GenVideoFrameOrigin;
  frameStorageKey?: string;
}) {
  const outputMedia = storageKey
    ? await createMedia({
        ownerWorkspaceId: workspaceId,
        bucket: getVideoGenBucketNameForUser(userId).bucketName,
        storageKey,
        filename: storageKey.split('/').pop() ?? storageKey,
        mimeType: 'video/mp4',
        size: 1024,
        origin: 'generated',
      })
    : undefined;

  const frameMedia = frameStorageKey
    ? await createMedia({
        ownerWorkspaceId: workspaceId,
        bucket: getVideoFrameBucketNameForUser(userId).bucketName,
        storageKey: frameStorageKey,
        filename: frameStorageKey.split('/').pop() ?? frameStorageKey,
        mimeType: 'image/png',
        size: 1024,
        origin: 'uploaded',
      })
    : undefined;

  return createGenVideoRecord({
    prompt: 'a drone shot over a city',
    provider: 'google-vertex',
    model: 'veo-3.1-generate-001',
    status,
    userId,
    workspaceId,
    mediaId: outputMedia?.id,
    frameOrigin,
    frameMediaId: frameMedia?.id,
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

  test('accepts an uploaded frame owned by the same workspace', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const formData = new FormData();
    formData.append('file', pngFile('frame.png'));
    const uploadResponse = await app.request(`/workspace/${workspaceId}/gen-video/frame-upload`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
      body: formData,
    });
    const { mediaId } = uploadResponseSchema.parse(await uploadResponse.json());

    const response = await app.request(`/workspace/${workspaceId}/gen-video`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: 'a drone shot over a city',
        provider: 'google-vertex',
        model: 'veo-3.1-generate-001',
        frame: { origin: 'upload', mediaId },
      }),
    });

    expect(response.status).toBe(StatusCodes.CREATED);
  });

  test("404s when an uploaded frame is another workspace's media", async () => {
    const owner = await seedAuthenticatedUser();
    const attacker = await seedAuthenticatedUser();

    const formData = new FormData();
    formData.append('file', pngFile('frame.png'));
    const uploadResponse = await app.request(
      `/workspace/${owner.workspaceId}/gen-video/frame-upload`,
      { method: 'POST', headers: { cookie: owner.cookieHeader }, body: formData },
    );
    const { mediaId } = uploadResponseSchema.parse(await uploadResponse.json());

    const response = await app.request(`/workspace/${attacker.workspaceId}/gen-video`, {
      method: 'POST',
      headers: { cookie: attacker.cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: 'a drone shot over a city',
        provider: 'google-vertex',
        model: 'veo-3.1-generate-001',
        frame: { origin: 'upload', mediaId },
      }),
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('POST /workspace/:workspaceId/gen-video/frame-upload', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('stores the upload as a workspace image media row and returns its id', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const formData = new FormData();
    formData.append('file', pngFile('frame.png'));

    const response = await app.request(`/workspace/${workspaceId}/gen-video/frame-upload`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
      body: formData,
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    const body = uploadResponseSchema.parse(await response.json());
    const mediaRow = await getMediaById({ id: body.mediaId });
    expect(mediaRow?.ownerWorkspaceId).toBe(workspaceId);
    expect(mediaRow?.mimeType).toBe('image/png');
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

  test('rejects a non-image file that claims an image mime type', async () => {
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

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(uploadObjectBufferMock).not.toHaveBeenCalled();
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
    // Each media row is refcount-deleted independently
    // (docs/media-library/migration-prd.md decision 5), so the output and
    // the frame come off in two separate deleteObjects calls, not one
    // combined call.
    expect(deleteObjectsMock).toHaveBeenCalledTimes(2);
    const deletedKeys = deleteObjectsMock.mock.calls.flatMap(([calledBucket, keys]) => {
      expect(calledBucket).toBe(bucketName);
      return keys;
    });
    expect(deletedKeys.sort()).toEqual([frameStorageKey, storageKey].sort());
  });

  test("leaves a shared media object alone while a gen_images row still references it", async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const storageKey = `${userId}/videos/generated/clip.mp4`;
    const imageStorageKey = `${userId}/images/generated/source.png`;

    const imageMedia = await createMedia({
      ownerWorkspaceId: workspaceId,
      bucket: getImgGenBucketNameForUser(userId).bucketName,
      storageKey: imageStorageKey,
      filename: 'source.png',
      mimeType: 'image/png',
      size: 1024,
      origin: 'generated',
    });
    // A real gen_images row keeps this media referenced after the video row
    // is deleted, proving a 'genImage'-origin frame link doesn't own the
    // object it points at (docs/media-library/migration-prd.md decision 5):
    // deleting the video must not delete media another row still needs.
    await createGenImageRecords([
      {
        userId,
        workspaceId,
        mediaId: imageMedia.id,
        prompt: 'source image',
        provider: 'bfl',
        model: 'flux-pro',
      },
    ]);

    const clipMedia = await createMedia({
      ownerWorkspaceId: workspaceId,
      bucket: getVideoGenBucketNameForUser(userId).bucketName,
      storageKey,
      filename: 'clip.mp4',
      mimeType: 'video/mp4',
      size: 1024,
      origin: 'generated',
    });
    // The frame links straight at the gen_images row's own media (no copy),
    // so the video row is created directly here instead of through
    // seedCompletedVideo, which always mints a fresh frame media row.
    const video = await createGenVideoRecord({
      prompt: 'a drone shot over a city',
      provider: 'google-vertex',
      model: 'veo-3.1-generate-001',
      status: 'completed',
      userId,
      workspaceId,
      mediaId: clipMedia.id,
      frameOrigin: 'genImage',
      frameMediaId: imageMedia.id,
    });
    const { bucketName } = getVideoGenBucketNameForUser(userId);

    const response = await app.request(`/workspace/${workspaceId}/gen-video/${video.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(deleteObjectsMock).toHaveBeenCalledTimes(1);
    expect(deleteObjectsMock.mock.calls[0]).toEqual([bucketName, [storageKey]]);
    expect(await getMediaById({ id: imageMedia.id })).not.toBeNull();
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
