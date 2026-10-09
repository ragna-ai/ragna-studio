import { db } from '@repo/database';
import {
  agent,
  chat,
  dataset,
  genImage,
  genVideo,
  socialPost,
  workflow,
  workflowRun,
} from '@repo/database/schema';
import {
  deleteSeededUser,
  seedAuthenticatedUser,
  seedOrganizationMember,
  seedTokenPricedAiModel,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';

// Hard-deleting a member keeps the work they authored and drops their chats.

beforeEach(async () => {
  await truncateAllTables();
});

async function seedMemberWithAuthoredWork() {
  const owner = await seedAuthenticatedUser();
  const membership = await db.query.member.findFirst({ where: { userId: owner.userId } });
  const member = await seedOrganizationMember({
    organizationId: membership?.organizationId ?? '',
    role: 'member',
  });
  const { userId } = member;
  const { workspaceId } = owner;

  const { aiModelId } = await seedTokenPricedAiModel();
  const [authoredAgent] = await db
    .insert(agent)
    .values({ userId, workspaceId, aiModelId, name: 'Mine', systemPrompt: 'x' })
    .returning({ id: agent.id });
  const [authoredWorkflow] = await db
    .insert(workflow)
    .values({ userId, workspaceId, name: 'Flow' })
    .returning({ id: workflow.id });
  const [authoredDataset] = await db
    .insert(dataset)
    .values({ userId, workspaceId, name: 'Rows' })
    .returning({ id: dataset.id });
  const [authoredImage] = await db
    .insert(genImage)
    .values({ userId, workspaceId, prompt: 'p', provider: 'x', model: 'y' })
    .returning({ id: genImage.id });
  const [authoredVideo] = await db
    .insert(genVideo)
    .values({ userId, workspaceId, prompt: 'p', provider: 'x', model: 'y' })
    .returning({ id: genVideo.id });
  const [authoredPost] = await db
    .insert(socialPost)
    .values({ userId, workspaceId, content: 'hello' })
    .returning({ id: socialPost.id });
  const [privateChat] = await db
    .insert(chat)
    .values({ userId, workspaceId, agentId: authoredAgent?.id ?? '', title: 'Private' })
    .returning({ id: chat.id });
  const [run] = await db
    .insert(workflowRun)
    .values({
      workflowId: authoredWorkflow?.id ?? '',
      definition: { nodes: [], edges: [] },
      triggeredByUserId: userId,
    })
    .returning({ id: workflowRun.id });

  return {
    member,
    ids: {
      agent: authoredAgent?.id ?? '',
      workflow: authoredWorkflow?.id ?? '',
      dataset: authoredDataset?.id ?? '',
      genImage: authoredImage?.id ?? '',
      genVideo: authoredVideo?.id ?? '',
      socialPost: authoredPost?.id ?? '',
      chat: privateChat?.id ?? '',
      run: run?.id ?? '',
    },
  };
}

describe('hard-deleting a member', () => {
  test('keeps their shared work with a null author', async () => {
    const { member, ids } = await seedMemberWithAuthoredWork();

    await deleteSeededUser({ userId: member.userId });

    expect((await db.query.agent.findFirst({ where: { id: ids.agent } }))?.userId).toBeNull();
    expect((await db.query.workflow.findFirst({ where: { id: ids.workflow } }))?.userId).toBeNull();
    expect((await db.query.dataset.findFirst({ where: { id: ids.dataset } }))?.userId).toBeNull();
    expect((await db.query.genImage.findFirst({ where: { id: ids.genImage } }))?.userId).toBeNull();
    expect((await db.query.genVideo.findFirst({ where: { id: ids.genVideo } }))?.userId).toBeNull();
    expect(
      (await db.query.socialPost.findFirst({ where: { id: ids.socialPost } }))?.userId,
    ).toBeNull();
  });

  test('keeps their workflow runs with a null user', async () => {
    const { member, ids } = await seedMemberWithAuthoredWork();

    await deleteSeededUser({ userId: member.userId });

    const run = await db.query.workflowRun.findFirst({ where: { id: ids.run } });
    expect(run).toBeDefined();
    expect(run?.triggeredByUserId).toBeNull();
  });

  test('deletes their private chats', async () => {
    const { member, ids } = await seedMemberWithAuthoredWork();

    await deleteSeededUser({ userId: member.userId });

    expect(await db.query.chat.findFirst({ where: { id: ids.chat } })).toBeUndefined();
  });
});
