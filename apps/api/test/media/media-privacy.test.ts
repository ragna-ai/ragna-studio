import { db } from '@repo/database';
import { task, taskAttachment } from '@repo/database/schema';
import {
  resetProviderMocks,
  seedAuthenticatedUser,
  seedOrganizationMember,
  seedTokenPricedAiModel,
  truncateAllTables,
  type SeededAuthenticatedUser,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// Media that only a chat attachment references is as private as the chat.

const mediaListSchema = z.object({
  media: z.array(
    z.strictObject({
      id: z.string(),
      filename: z.string(),
      mimeType: z.string(),
      size: z.number(),
      createdAt: z.string(),
    }),
  ),
});

interface Colleagues {
  author: SeededAuthenticatedUser;
  colleague: SeededAuthenticatedUser;
  mediaId: string;
}

async function seedChatAttachment(): Promise<Colleagues> {
  const author = await seedAuthenticatedUser();
  const membership = await db.query.member.findFirst({ where: { userId: author.userId } });
  const colleague = await seedOrganizationMember({
    organizationId: membership?.organizationId ?? '',
    role: 'member',
  });

  const { aiModelId } = await seedTokenPricedAiModel();
  const agentResponse = await app.request(`/workspace/${author.workspaceId}/agent`, {
    method: 'POST',
    headers: { cookie: author.cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Assistant', aiModelId, systemPrompt: 'Be helpful.' }),
  });
  const { agent } = z
    .object({ agent: z.object({ id: z.string() }) })
    .parse(await agentResponse.json());
  const chatResponse = await app.request(`/workspace/${author.workspaceId}/chat`, {
    method: 'POST',
    headers: { cookie: author.cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ agentId: agent.id }),
  });
  const { chat } = z
    .object({ chat: z.object({ id: z.string() }) })
    .parse(await chatResponse.json());

  const formData = new FormData();
  formData.append('files', new File(['a,b\n1,2\n'], 'data.csv', { type: 'text/csv' }));
  const uploadResponse = await app.request(
    `/workspace/${author.workspaceId}/chat/${chat.id}/attachments`,
    { method: 'POST', headers: { cookie: author.cookieHeader }, body: formData },
  );
  const { attachments } = z
    .object({ attachments: z.array(z.object({ mediaId: z.string() })) })
    .parse(await uploadResponse.json());

  return { author, colleague, mediaId: attachments[0]?.mediaId ?? '' };
}

async function listMediaIds(user: SeededAuthenticatedUser): Promise<string[]> {
  const response = await app.request(`/workspace/${user.workspaceId}/media`, {
    headers: { cookie: user.cookieHeader },
  });
  return mediaListSchema.parse(await response.json()).media.map((item) => item.id);
}

function download(user: SeededAuthenticatedUser, mediaId: string) {
  return app.request(`/workspace/${user.workspaceId}/media/${mediaId}/download`, {
    headers: { cookie: user.cookieHeader },
  });
}

beforeEach(async () => {
  await truncateAllTables();
  resetProviderMocks();
});

describe("a chat attachment's media", () => {
  test('stays visible and downloadable for the chat author', async () => {
    const { author, mediaId } = await seedChatAttachment();

    expect(await listMediaIds(author)).toEqual([mediaId]);
    expect((await download(author, mediaId)).status).toBe(StatusCodes.OK);
  });

  test('is hidden from a colleague in the list and 404s on download', async () => {
    const { colleague, mediaId } = await seedChatAttachment();

    expect(await listMediaIds(colleague)).toEqual([]);
    expect((await download(colleague, mediaId)).status).toBe(StatusCodes.NOT_FOUND);
  });

  test('becomes visible to a colleague once a task also references it', async () => {
    const { author, colleague, mediaId } = await seedChatAttachment();
    const [created] = await db
      .insert(task)
      .values({ workspaceId: author.workspaceId, title: 'Shared', number: 1, sortOrder: 'a0' })
      .returning({ id: task.id });
    await db.insert(taskAttachment).values({ taskId: created?.id ?? '', mediaId });

    expect(await listMediaIds(colleague)).toEqual([mediaId]);
    expect((await download(colleague, mediaId)).status).toBe(StatusCodes.OK);
  });
});
