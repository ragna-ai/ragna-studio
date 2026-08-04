import {
  resetProviderMocks,
  seedAuthenticatedUser,
  seedTokenPricedAiModel,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// GET /workspace/:workspaceId/media/:mediaId/download (docs/media-library/
// prd.md, decision 1: "owner access check ... in v1 membership of the
// owning workspace"). The interesting case here is media.service.ts's own
// ownerWorkspaceId check (getDownloadableMedia), which is distinct from
// workspaceGuard: a caller can legitimately own the :workspaceId in the URL
// while the :mediaId belongs to a *different* workspace they also don't
// own. Bytes come from the faked storage download
// (@repo/testing's storage-provider.mock.ts); the response's content-type
// still reflects the media row's real, sniffed mime type, since
// downloadMedia() sets it from `mediaRow.mimeType`, not the mock's.

const attachmentSchema = z.object({
  mediaId: z.string(),
  filename: z.string(),
  mediaType: z.string(),
});
const uploadResponseSchema = z.object({ attachments: z.array(attachmentSchema) });

async function createAgent(cookieHeader: string, workspaceId: string): Promise<string> {
  const { aiModelId } = await seedTokenPricedAiModel();

  const response = await app.request(`/workspace/${workspaceId}/agent`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Assistant', aiModelId, systemPrompt: 'You are helpful.' }),
  });
  const body = z.object({ agent: z.object({ id: z.string() }) }).parse(await response.json());
  return body.agent.id;
}

async function createChat(cookieHeader: string, workspaceId: string, agentId: string): Promise<string> {
  const response = await app.request(`/workspace/${workspaceId}/chat`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ agentId }),
  });
  const body = z.object({ chat: z.object({ id: z.string() }) }).parse(await response.json());
  return body.chat.id;
}

/** Uploads a tier-2 (csv) attachment and returns its media identity, the
 * simplest real path to a media row owned by a workspace. */
async function seedWorkspaceMedia() {
  const { workspaceId, cookieHeader } = await seedAuthenticatedUser();
  const agentId = await createAgent(cookieHeader, workspaceId);
  const chatId = await createChat(cookieHeader, workspaceId, agentId);

  const formData = new FormData();
  formData.append('files', new File(['a,b\n1,2\n'], 'data.csv', { type: 'text/csv' }));

  const response = await app.request(`/workspace/${workspaceId}/chat/${chatId}/attachments`, {
    method: 'POST',
    headers: { cookie: cookieHeader },
    body: formData,
  });
  const attachment = uploadResponseSchema.parse(await response.json()).attachments[0]!;

  return {
    workspaceId,
    cookieHeader,
    mediaId: attachment.mediaId,
    filename: attachment.filename,
    mediaType: attachment.mediaType,
  };
}

describe('GET /workspace/:workspaceId/media/:mediaId/download', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('streams the object for a workspace member with the right headers', async () => {
    const { workspaceId, cookieHeader, mediaId, filename, mediaType } = await seedWorkspaceMedia();

    const response = await app.request(`/workspace/${workspaceId}/media/${mediaId}/download`, {
      headers: { cookie: cookieHeader },
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers.get('content-type')).toBe(mediaType);
    expect(response.headers.get('content-disposition')).toBe(`attachment; filename="${filename}"`);
    const body = await response.text();
    expect(body.length).toBeGreaterThan(0);
  });

  test('rejects an unauthenticated request', async () => {
    const { workspaceId, mediaId } = await seedWorkspaceMedia();

    const response = await app.request(`/workspace/${workspaceId}/media/${mediaId}/download`);

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  test('404s for media owned by a different workspace', async () => {
    const owner = await seedWorkspaceMedia();
    const otherUser = await seedAuthenticatedUser();

    const response = await app.request(
      `/workspace/${otherUser.workspaceId}/media/${owner.mediaId}/download`,
      { headers: { cookie: otherUser.cookieHeader } },
    );

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  test('404s for a media id that does not exist', async () => {
    const { workspaceId, cookieHeader } = await seedAuthenticatedUser();

    const response = await app.request(
      `/workspace/${workspaceId}/media/019fb2d8-0000-7000-8000-000000000000/download`,
      { headers: { cookie: cookieHeader } },
    );

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});
