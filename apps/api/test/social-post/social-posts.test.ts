import {
  createPostMock,
  resetProviderMocks,
  seedAuthenticatedUser,
  seedLinkedinAccount,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// social-post (docs/testing/strategy.md's "Blocked on mock infrastructure",
// now unblocked). Auth/authorization are covered exhaustively in test/auth/
// and test/workspace/workspace-authorization.test.ts; this file only checks
// the social-post feature's own behavior. CRUD needs no mock at all;
// `/publish` needs the LinkedIn client faked (@repo/testing's
// linkedin-provider.mock.ts).

// Every route (list/get/create/PATCH/publish) now returns `toPostResponse`'s
// shape (social-post.service.ts): `media` is always present, and
// userId/workspaceId/deletedAt never leave the API, since the frontend's
// SocialPost DTO (useSocialPostApi.ts) never declares them. `.strict()`
// catches a future spread silently reintroducing one of those.
const postSchema = z
  .object({
    id: z.string(),
    platform: z.string(),
    content: z.string(),
    status: z.enum(['draft', 'published', 'failed']),
    source: z.string(),
    externalId: z.string().nullable(),
    externalUrl: z.string().nullable(),
    publishedAt: z.string().nullable(),
    publishError: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    media: z.array(z.object({ id: z.string() })),
  })
  .strict();

const postResponseSchema = z.object({ post: postSchema });
const listResponseSchema = z.object({
  posts: z.array(postSchema),
  meta: z.object({ totalCount: z.number() }),
});

async function createDraft(cookieHeader: string, workspaceId: string, content = 'Draft content') {
  const response = await app.request(`/workspace/${workspaceId}/social-post`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  return postResponseSchema.parse(await response.json()).post;
}

describe('GET /workspace/:workspaceId/social-post', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('rejects the request when no session cookie is sent', async () => {
    const response = await app.request('/workspace/any-workspace-id/social-post');

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  test('starts empty for a new workspace', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(`/workspace/${workspaceId}/social-post`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = listResponseSchema.parse(await response.json());
    expect(body.posts).toEqual([]);
  });
});

describe('POST /workspace/:workspaceId/social-post', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('creates a draft and it shows up in the list', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const created = await createDraft(cookieHeader, workspaceId, 'Hello LinkedIn');
    expect(created.status).toBe('draft');
    expect(created.content).toBe('Hello LinkedIn');

    const listResponse = await app.request(`/workspace/${workspaceId}/social-post`, {
      headers: { cookie: cookieHeader },
    });
    const body = listResponseSchema.parse(await listResponse.json());
    expect(body.posts.map((post) => post.id)).toEqual([created.id]);
  });
});

describe('PATCH /workspace/:workspaceId/social-post/:socialPostId', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('edits a draft', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const created = await createDraft(cookieHeader, workspaceId);

    const response = await app.request(`/workspace/${workspaceId}/social-post/${created.id}`, {
      method: 'PATCH',
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'Updated content' }),
    });

    expect(response.status).toBe(StatusCodes.OK);
    const body = postResponseSchema.parse(await response.json());
    expect(body.post.content).toBe('Updated content');
  });

  test('404s for a post id that does not exist', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(
      `/workspace/${workspaceId}/social-post/019fb2d8-0000-7000-8000-000000000000`,
      {
        method: 'PATCH',
        headers: { cookie: cookieHeader, 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'Updated content' }),
      },
    );

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe('DELETE /workspace/:workspaceId/social-post/:socialPostId', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('removes the draft from the list', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const created = await createDraft(cookieHeader, workspaceId);

    const deleteResponse = await app.request(
      `/workspace/${workspaceId}/social-post/${created.id}`,
      { method: 'DELETE', headers: { cookie: cookieHeader } },
    );
    expect(deleteResponse.status).toBe(StatusCodes.OK);

    const listResponse = await app.request(`/workspace/${workspaceId}/social-post`, {
      headers: { cookie: cookieHeader },
    });
    const body = listResponseSchema.parse(await listResponse.json());
    expect(body.posts).toEqual([]);
  });
});

describe('POST /workspace/:workspaceId/social-post/:socialPostId/publish', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('returns a LINKEDIN_NOT_CONNECTED sentinel when no LinkedIn account is linked', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
    const created = await createDraft(cookieHeader, workspaceId, 'Ready to publish');

    const response = await app.request(
      `/workspace/${workspaceId}/social-post/${created.id}/publish`,
      { method: 'POST', headers: { cookie: cookieHeader } },
    );

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    const body = z.object({ errorCode: z.string() }).parse(await response.json());
    expect(body.errorCode).toBe('LINKEDIN_NOT_CONNECTED');
    expect(createPostMock).not.toHaveBeenCalled();
  });

  test('publishes through the faked LinkedIn client and flips the post to published', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    await seedLinkedinAccount({ userId });
    const created = await createDraft(cookieHeader, workspaceId, 'Ready to publish');

    const response = await app.request(
      `/workspace/${workspaceId}/social-post/${created.id}/publish`,
      { method: 'POST', headers: { cookie: cookieHeader } },
    );

    expect(response.status).toBe(StatusCodes.OK);
    const body = postResponseSchema.parse(await response.json());
    expect(body.post.status).toBe('published');
    expect(createPostMock).toHaveBeenCalledTimes(1);
    expect(createPostMock.mock.calls[0]?.[0]).toMatchObject({ text: 'Ready to publish' });
  });

  test('rejects publishing a draft with empty content', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    await seedLinkedinAccount({ userId });
    const created = await createDraft(cookieHeader, workspaceId, '');

    const response = await app.request(
      `/workspace/${workspaceId}/social-post/${created.id}/publish`,
      { method: 'POST', headers: { cookie: cookieHeader } },
    );

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(createPostMock).not.toHaveBeenCalled();
  });

  test('marks the post failed when the faked LinkedIn client rejects', async () => {
    const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
    await seedLinkedinAccount({ userId });
    const created = await createDraft(cookieHeader, workspaceId, 'Ready to publish');

    createPostMock.mockImplementationOnce(() => {
      throw new Error('LinkedIn is down');
    });

    const publishResponse = await app.request(
      `/workspace/${workspaceId}/social-post/${created.id}/publish`,
      { method: 'POST', headers: { cookie: cookieHeader } },
    );
    expect(publishResponse.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);

    const getResponse = await app.request(`/workspace/${workspaceId}/social-post/${created.id}`, {
      headers: { cookie: cookieHeader },
    });
    const body = postResponseSchema.parse(await getResponse.json());
    expect(body.post.status).toBe('failed');
  });
});
