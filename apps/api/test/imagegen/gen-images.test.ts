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

// imagegen (docs/testing/strategy.md's "Blocked on mock infrastructure",
// now unblocked). Auth/authorization are covered exhaustively in test/auth/
// and test/workspace/workspace-authorization.test.ts; this file only checks
// the imagegen feature's own behavior, with the AI provider call faked
// (@repo/testing's ai-provider.mock.ts) and the R2 upload faked
// (@repo/testing's storage-provider.mock.ts).

const genImageSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  provider: z.string(),
  model: z.string(),
  imgUrl: z.string(),
  rawUrl: z.string(),
  referenceImages: z.array(z.object({ origin: z.string(), imgUrl: z.string() })),
});

const generateResponseSchema = z.object({ genImages: z.array(genImageSchema) });
const listResponseSchema = z.object({
  genImages: z.array(genImageSchema),
  meta: z.object({ totalCount: z.number() }),
});

async function generateOneImage(cookieHeader: string, workspaceId: string) {
  const { aiModelId } = await seedImageAiModel({ provider: 'bfl' });

  const response = await app.request(`/workspace/${workspaceId}/gen-image`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ aiModelId, prompt: 'a red bicycle', n: 1 }),
  });
  const body = generateResponseSchema.parse(await response.json());
  const genImage = body.genImages[0];

  if (!genImage) {
    throw new Error('Expected the fake provider to return one generated image');
  }

  return genImage;
}

// buildImageUrls (packages/storage/src/lib/image-urls.ts) formats imgUrl as
// `https://images.ragna.io/${key}`, so this reverses it back to the R2
// object key the delete route is expected to pass to deleteObjects.
function storageKeyFromImgUrl(imgUrl: string): string {
  return imgUrl.replace('https://images.ragna.io/', '');
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
});

describe('POST /workspace/:workspaceId/gen-image', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('generates an image through the faked provider and persists it for real', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const { aiModelId } = await seedImageAiModel({ provider: 'bfl' });

    const response = await app.request(`/workspace/${workspaceId}/gen-image`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ aiModelId, prompt: 'a red bicycle', n: 1 }),
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    const body = generateResponseSchema.parse(await response.json());
    expect(body.genImages).toHaveLength(1);
    expect(body.genImages[0]?.prompt).toBe('a red bicycle');
    expect(generateImageMock).toHaveBeenCalledTimes(1);

    // Proves the DB path is real, not mocked: the row created above by the
    // faked provider call is readable back through the real list query.
    const listResponse = await app.request(`/workspace/${workspaceId}/gen-image`, {
      headers: { cookie: cookieHeader },
    });
    const listBody = listResponseSchema.parse(await listResponse.json());
    expect(listBody.genImages.map((image) => image.id)).toEqual([body.genImages[0]?.id]);
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
});

describe('POST /workspace/:workspaceId/gen-image/reference-upload', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('uploads a reference image through the faked storage client', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const formData = new FormData();
    formData.append(
      'file',
      new File([new Uint8Array([1, 2, 3])], 'ref.png', {
        type: 'image/png',
      }),
    );

    const response = await app.request(`/workspace/${workspaceId}/gen-image/reference-upload`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
      body: formData,
    });

    expect(response.status).toBe(StatusCodes.CREATED);
    const body = z.object({ storageKey: z.string().min(1) }).parse(await response.json());
    expect(body.storageKey).toContain('images/references');
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
    const image = await generateOneImage(owner.cookieHeader, owner.workspaceId);
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

  test('deletes the row and its R2 object, removing it from the list', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const image = await generateOneImage(cookieHeader, workspaceId);
    const expectedKey = storageKeyFromImgUrl(image.imgUrl);
    const { bucketName } = getImgGenBucketNameForUser(userId);

    const response = await app.request(`/workspace/${workspaceId}/gen-image/${image.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(deleteObjectsMock).toHaveBeenCalledTimes(1);
    expect(deleteObjectsMock.mock.calls[0]).toEqual([bucketName, [expectedKey]]);

    const listResponse = await app.request(`/workspace/${workspaceId}/gen-image`, {
      headers: { cookie: cookieHeader },
    });
    const listBody = listResponseSchema.parse(await listResponse.json());
    expect(listBody.genImages).toEqual([]);
  });

  test('still deletes the row when the R2 delete fails (best-effort cleanup)', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const image = await generateOneImage(cookieHeader, workspaceId);

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
