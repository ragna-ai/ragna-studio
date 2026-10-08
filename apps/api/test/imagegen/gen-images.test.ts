import type { GenImageStatus } from '@repo/database';
import { createGenImageRecords, createMedia, getMediaById } from '@repo/database';
import { getImgGenBucketNameForUser } from '@repo/storage';
import {
  deleteObjectsMock,
  generateImageMock,
  resetProviderMocks,
  seedAuthenticatedUser,
  seedImageAiModel,
  truncateAllTables,
  uploadObjectBufferMock,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

const SINGLE_UPLOAD_LIMIT_BYTES = 11 * 1024 * 1024;

// imagegen.
// Auth/authorization are covered exhaustively in test/auth/
// and test/workspace/workspace-authorization.test.ts; this file only checks
// the imagegen feature's own behavior.
//
// Like videogen (test/videogen/gen-videos.test.ts), the create route
// (`generateImagesForWorkspace` -> `requestGenImages`, @repo/ai) no longer
// calls the `ai` package: it inserts a batch of pending rows and enqueues a
// BullMQ job. Enqueueing is faked by @repo/testing's queue mock
// rather than hitting
// the real docker Redis apps/worker's dev process also polls. The actual
// provider call (`runGenImages`/`generateAndUploadBatch`) only runs from
// apps/worker's gen-images processor, out of scope here,
// so completed/failed rows are
// seeded directly via the repo (seedGenImage below) rather than waiting on a
// real render. `generateImageMock` is still asserted un-called in the POST
// tests, to prove generation really was deferred to the worker rather than
// running synchronously. The reference-upload route does need the storage
// mock.

// Smallest valid 1x1 PNG: upload validation sniffs content, not file.type.
const ONE_PX_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function pngFile(name: string): File {
  return new File([Buffer.from(ONE_PX_PNG_BASE64, 'base64')], name, { type: 'image/png' });
}

const uploadResponseSchema = z.object({ mediaId: z.string().min(1), imgUrl: z.string().min(1) });

const genImageSchema = z.strictObject({
  id: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  error: z.string().nullable(),
  prompt: z.string(),
  createdAt: z.string(),
  aspectRatio: z.string().nullable(),
  resolution: z.string().nullable(),
  seed: z.number().nullable(),
  negativePrompt: z.string().nullable(),
  visibleWatermark: z.boolean(),
  provider: z.string(),
  model: z.string(),
  // Undefined until the row completes.
  imgUrl: z.string().optional(),
  referenceImages: z.array(z.strictObject({ origin: z.string(), imgUrl: z.string() })),
});

const generateResponseSchema = z.strictObject({ genImages: z.array(genImageSchema) });
const listResponseSchema = z.strictObject({
  genImages: z.array(genImageSchema),
  meta: z.strictObject({ totalCount: z.number() }),
});

// The render is done by apps/worker's gen-images processor (out of scope
// here, see the top-of-file comment), so a row at any status is seeded
// directly via the repo rather than waiting on a real generation.
// storageKey is a convenience param: when present it mints its own media row
// before the gen_images row is
// created, leaving mediaId null otherwise (a pending/failed row has no
// object yet, specs/imagegen/worker-execution-prd.md decision 1).
async function seedGenImage({
  userId,
  workspaceId,
  status = 'completed',
  storageKey,
  error,
}: {
  userId: string;
  workspaceId: string;
  status?: GenImageStatus;
  storageKey?: string;
  error?: string;
}) {
  const outputMedia = storageKey
    ? await createMedia({
        ownerWorkspaceId: workspaceId,
        bucket: getImgGenBucketNameForUser(userId).bucketName,
        storageKey,
        filename: storageKey.split('/').pop() ?? storageKey,
        mimeType: 'image/png',
        size: 1024,
        origin: 'generated',
      })
    : undefined;

  const [created] = await createGenImageRecords([
    {
      userId,
      workspaceId,
      status,
      mediaId: outputMedia?.id,
      error,
      prompt: 'a red bicycle',
      provider: 'bfl',
      model: 'flux-pro',
    },
  ]);

  if (!created) {
    throw new Error('Failed to seed a gen image row');
  }

  return created;
}

describe('GET /workspace/:workspaceId/gen-image', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('rejects the request when no session cookie is sent', async () => {
    const response = await app.request('/workspace/any-workspace-id/gen-image');

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  test('starts empty for a new workspace', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/gen-image`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = listResponseSchema.parse(await response.json());
    expect(body.genImages).toEqual([]);
    expect(body.meta.totalCount).toBe(0);
  });

  test('lists completed, pending, and failed rows with the right shape each', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const completed = await seedGenImage({
      userId,
      workspaceId,
      status: 'completed',
      storageKey: `${userId}/images/generated/done.png`,
    });
    const pending = await seedGenImage({ userId, workspaceId, status: 'pending' });
    const failed = await seedGenImage({
      userId,
      workspaceId,
      status: 'failed',
      error: 'Image generation failed',
    });

    const response = await app.request(`/workspace/${workspaceId}/gen-image`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = listResponseSchema.parse(await response.json());
    expect(body.meta.totalCount).toBe(3);

    const byId = new Map(body.genImages.map((image) => [image.id, image]));

    expect(byId.get(completed.id)?.status).toBe('completed');
    expect(byId.get(completed.id)?.imgUrl).toBeDefined();
    expect(byId.get(completed.id)?.error).toBeNull();

    expect(byId.get(pending.id)?.status).toBe('pending');
    expect(byId.get(pending.id)?.imgUrl).toBeUndefined();

    expect(byId.get(failed.id)?.status).toBe('failed');
    expect(byId.get(failed.id)?.error).toBe('Image generation failed');
    expect(byId.get(failed.id)?.imgUrl).toBeUndefined();
  });
});

describe('POST /workspace/:workspaceId/gen-image', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('requests a batch of image generations and they show up pending in the list', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedImageAiModel({ provider: 'bfl' });

    const response = await app.request(`/workspace/${workspaceId}/gen-image`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ aiModelId, prompt: 'a red bicycle', n: 2 }),
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    const body = generateResponseSchema.parse(await response.json());
    expect(body.genImages).toHaveLength(2);
    for (const image of body.genImages) {
      expect(image.status).toBe('pending');
      expect(image.prompt).toBe('a red bicycle');
      expect(image.imgUrl).toBeUndefined();
    }
    // Proves generation didn't run synchronously in the API process:
    // only the worker's gen-images
    // processor calls the provider.
    expect(generateImageMock).not.toHaveBeenCalled();

    // Proves the DB path is real, not mocked: the rows created above are
    // readable back through the real list query.
    const listResponse = await app.request(`/workspace/${workspaceId}/gen-image`, {
      headers: { cookie: cookieHeader },
    });
    const listBody = listResponseSchema.parse(await listResponse.json());
    expect(listBody.genImages.map((image) => image.id).sort()).toEqual(
      body.genImages.map((image) => image.id).sort(),
    );
  });

  test('404s for an aiModelId that does not exist', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/gen-image`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        aiModelId: '019fb2d8-0000-7000-8000-000000000000',
        prompt: 'a red bicycle',
      }),
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(generateImageMock).not.toHaveBeenCalled();
  });

  test('rejects negativePrompt when the model does not support it', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedImageAiModel({ capabilities: { canGenerateImage: true } });

    const response = await app.request(`/workspace/${workspaceId}/gen-image`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ aiModelId, prompt: 'a red bicycle', negativePrompt: 'no cars' }),
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(generateImageMock).not.toHaveBeenCalled();
  });

  test('404s when a reference image points at a not-yet-completed gen image', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedImageAiModel({ provider: 'bfl' });
    const pendingReference = await seedGenImage({ userId, workspaceId, status: 'pending' });

    const response = await app.request(`/workspace/${workspaceId}/gen-image`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        aiModelId,
        prompt: 'a red bicycle',
        referenceImages: [{ origin: 'genImage', genImageId: pendingReference.id }],
      }),
    });

    // mediaId is null on a pending row:
    // resolveReferenceImage (apps/api's imagegen.service.ts)
    // treats that the same as a reference that doesn't exist at all.
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(generateImageMock).not.toHaveBeenCalled();
  });

  test('404s when a reference image points at a failed gen image', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedImageAiModel({ provider: 'bfl' });
    const failedReference = await seedGenImage({
      userId,
      workspaceId,
      status: 'failed',
      error: 'Image generation failed',
    });

    const response = await app.request(`/workspace/${workspaceId}/gen-image`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        aiModelId,
        prompt: 'a red bicycle',
        referenceImages: [{ origin: 'genImage', genImageId: failedReference.id }],
      }),
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(generateImageMock).not.toHaveBeenCalled();
  });

  test("404s when an uploaded reference is another workspace's media", async () => {
    const owner = await seedAuthenticatedUser();
    const attacker = await seedAuthenticatedUser();
    const { aiModelId } = await seedImageAiModel({ provider: 'bfl' });

    const formData = new FormData();
    formData.append('file', pngFile('ref.png'));
    const uploadResponse = await app.request(
      `/workspace/${owner.workspaceId}/gen-image/reference-upload`,
      { method: 'POST', headers: { cookie: owner.cookieHeader }, body: formData },
    );
    const { mediaId } = uploadResponseSchema.parse(await uploadResponse.json());

    const response = await app.request(`/workspace/${attacker.workspaceId}/gen-image`, {
      method: 'POST',
      headers: { cookie: attacker.cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        aiModelId,
        prompt: 'a red bicycle',
        referenceImages: [{ origin: 'upload', mediaId }],
      }),
    });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(generateImageMock).not.toHaveBeenCalled();
  });
});

describe('POST /workspace/:workspaceId/gen-image/reference-upload', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('stores the upload as a workspace image media row and returns its id', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const formData = new FormData();
    formData.append('file', pngFile('ref.png'));

    const response = await app.request(`/workspace/${workspaceId}/gen-image/reference-upload`, {
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
      new File([new Uint8Array([1, 2, 3])], 'ref.txt', { type: 'text/plain' }),
    );

    const response = await app.request(`/workspace/${workspaceId}/gen-image/reference-upload`, {
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
      new File([new Uint8Array([1, 2, 3])], 'ref.png', { type: 'image/png' }),
    );

    const response = await app.request(`/workspace/${workspaceId}/gen-image/reference-upload`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
      body: formData,
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(uploadObjectBufferMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /workspace/:workspaceId/gen-image/:genImageId', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('rejects the request when no session cookie is sent', async () => {
    const response = await app.request(
      '/workspace/any-workspace-id/gen-image/019fb2d8-0000-7000-8000-000000000000',
      { method: 'DELETE' },
    );

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  test('404s for a genImageId that does not exist', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(
      `/workspace/${workspaceId}/gen-image/019fb2d8-0000-7000-8000-000000000000`,
      { method: 'DELETE', headers: { cookie: cookieHeader } },
    );

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('404s for a genImageId that belongs to another workspace', async () => {
    const owner = await seedAuthenticatedUser();
    const image = await seedGenImage({
      userId: owner.userId,
      workspaceId: owner.workspaceId,
      storageKey: `${owner.userId}/images/generated/owned.png`,
    });
    const otherUser = await seedAuthenticatedUser();

    const response = await app.request(
      `/workspace/${otherUser.workspaceId}/gen-image/${image.id}`,
      { method: 'DELETE', headers: { cookie: otherUser.cookieHeader } },
    );

    expect(response.status).toBe(StatusCodes.NOT_FOUND);

    // Proves the mismatched workspace was rejected before touching R2 or
    // the row, not just before returning it in the response.
    expect(deleteObjectsMock).not.toHaveBeenCalled();
    const listResponse = await app.request(`/workspace/${owner.workspaceId}/gen-image`, {
      headers: { cookie: owner.cookieHeader },
    });
    const listBody = listResponseSchema.parse(await listResponse.json());
    expect(listBody.genImages.map((genImage) => genImage.id)).toEqual([image.id]);
  });

  test('deletes a pending image with no generated object yet, without touching R2', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const image = await seedGenImage({ userId, workspaceId, status: 'pending' });

    const response = await app.request(`/workspace/${workspaceId}/gen-image/${image.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    // mediaId is null on a pending row:
    // deleteGenImage's refcount cleanup must skip it
    // instead of trying to refcount-delete a null media id.
    expect(response.status).toBe(StatusCodes.OK);
    expect(deleteObjectsMock).not.toHaveBeenCalled();

    const listResponse = await app.request(`/workspace/${workspaceId}/gen-image`, {
      headers: { cookie: cookieHeader },
    });
    const listBody = listResponseSchema.parse(await listResponse.json());
    expect(listBody.genImages).toEqual([]);
  });

  test('deletes the row and its R2 object, removing it from the list', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const storageKey = `${userId}/images/generated/done.png`;
    const image = await seedGenImage({ userId, workspaceId, storageKey });
    const { bucketName } = getImgGenBucketNameForUser(userId);

    const response = await app.request(`/workspace/${workspaceId}/gen-image/${image.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(deleteObjectsMock).toHaveBeenCalledTimes(1);
    expect(deleteObjectsMock.mock.calls[0]).toEqual([bucketName, [storageKey]]);

    const listResponse = await app.request(`/workspace/${workspaceId}/gen-image`, {
      headers: { cookie: cookieHeader },
    });
    const listBody = listResponseSchema.parse(await listResponse.json());
    expect(listBody.genImages).toEqual([]);
  });

  test('still deletes the row when the R2 delete fails (best-effort cleanup)', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const image = await seedGenImage({
      userId,
      workspaceId,
      storageKey: `${userId}/images/generated/done.png`,
    });

    deleteObjectsMock.mockImplementationOnce(() => {
      throw new Error('R2 is down');
    });

    const response = await app.request(`/workspace/${workspaceId}/gen-image/${image.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);

    const listResponse = await app.request(`/workspace/${workspaceId}/gen-image`, {
      headers: { cookie: cookieHeader },
    });
    const listBody = listResponseSchema.parse(await listResponse.json());
    expect(listBody.genImages).toEqual([]);
  });
});

describe('POST /workspace/:workspaceId/gen-image/reference-upload (body limit)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('413s a body over the 11 MB single-upload limit', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const formData = new FormData();
    formData.append('file', new File([new Uint8Array(SINGLE_UPLOAD_LIMIT_BYTES + 1)], 'big.png', { type: 'image/png' }));

    const response = await app.request(`/workspace/${workspaceId}/gen-image/reference-upload`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
      body: formData,
    });

    expect(response.status).toBe(StatusCodes.REQUEST_TOO_LONG);
    expect(uploadObjectBufferMock).not.toHaveBeenCalled();
  });
});
