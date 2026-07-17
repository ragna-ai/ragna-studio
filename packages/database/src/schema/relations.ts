import { defineRelations } from 'drizzle-orm';
import { account } from './account.schema';
import { agentDocument } from './agent-document.schema';
import { agent, agentTemplate } from './agent.schema';
import { aiModel } from './aimodel.schema';
import { chat, chatMessage } from './chat.schema';
import { dataset, datasetRow } from './dataset.schema';
import { genImage } from './genimage.schema';
import { agentMemory } from './memory.schema';
import { notification } from './notification.schema';
import { session } from './session.schema';
import { socialPost, socialPostMedia } from './social-post.schema';
import { user } from './user.schema';
import { verification } from './verification.schema';
import { workflow, workflowRun, workflowRunStep } from './workflow.schema';
import { workspace } from './workspace.schema';

const schema = {
  user,
  account,
  session,
  verification,
  aiModel,
  agent,
  agentTemplate,
  agentMemory,
  agentDocument,
  chat,
  chatMessage,
  dataset,
  datasetRow,
  genImage,
  socialPost,
  socialPostMedia,
  workflow,
  workflowRun,
  workflowRunStep,
  notification,
  workspace,
};

export const relations = defineRelations(schema, (r) => ({
  user: {
    accounts: r.many.account(),
    sessions: r.many.session(),
    agents: r.many.agent(),
    chats: r.many.chat(),
    genImages: r.many.genImage(),
    socialPosts: r.many.socialPost(),
    workflows: r.many.workflow(),
    notifications: r.many.notification(),
    workspaces: r.many.workspace(),
    datasets: r.many.dataset(),
  },
  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
      optional: false,
    }),
  },
  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
      optional: false,
    }),
  },
  aiModel: {
    agents: r.many.agent(),
    agentTemplates: r.many.agentTemplate(),
  },
  agent: {
    user: r.one.user({
      from: r.agent.userId,
      to: r.user.id,
      optional: false,
    }),
    workspace: r.one.workspace({
      from: r.agent.workspaceId,
      to: r.workspace.id,
      optional: true,
    }),
    aiModel: r.one.aiModel({
      from: r.agent.aiModelId,
      to: r.aiModel.id,
      optional: false,
    }),
    defaultDataset: r.one.dataset({
      from: r.agent.defaultDatasetId,
      to: r.dataset.id,
      optional: true,
    }),
    chats: r.many.chat(),
    memory: r.one.agentMemory(),
    documents: r.many.agentDocument(),
  },
  agentMemory: {
    agent: r.one.agent({
      from: r.agentMemory.agentId,
      to: r.agent.id,
      optional: false,
    }),
  },
  agentDocument: {
    agent: r.one.agent({
      from: r.agentDocument.agentId,
      to: r.agent.id,
      optional: false,
    }),
  },
  agentTemplate: {
    aiModel: r.one.aiModel({
      from: r.agentTemplate.aiModelId,
      to: r.aiModel.id,
      optional: false,
    }),
  },
  chat: {
    user: r.one.user({
      from: r.chat.userId,
      to: r.user.id,
      optional: false,
    }),
    workspace: r.one.workspace({
      from: r.chat.workspaceId,
      to: r.workspace.id,
      optional: true,
    }),
    agent: r.one.agent({
      from: r.chat.agentId,
      to: r.agent.id,
      optional: false,
    }),
    messages: r.many.chatMessage(),
  },
  chatMessage: {
    chat: r.one.chat({
      from: r.chatMessage.chatId,
      to: r.chat.id,
      optional: false,
    }),
  },
  dataset: {
    user: r.one.user({
      from: r.dataset.userId,
      to: r.user.id,
      optional: false,
    }),
    workspace: r.one.workspace({
      from: r.dataset.workspaceId,
      to: r.workspace.id,
      optional: true,
    }),
    rows: r.many.datasetRow(),
    pinnedByAgents: r.many.agent(),
  },
  datasetRow: {
    dataset: r.one.dataset({
      from: r.datasetRow.datasetId,
      to: r.dataset.id,
      optional: false,
    }),
  },
  genImage: {
    user: r.one.user({
      from: r.genImage.userId,
      to: r.user.id,
      optional: false,
    }),
    workspace: r.one.workspace({
      from: r.genImage.workspaceId,
      to: r.workspace.id,
      optional: true,
    }),
  },
  socialPost: {
    user: r.one.user({
      from: r.socialPost.userId,
      to: r.user.id,
      optional: false,
    }),
    workspace: r.one.workspace({
      from: r.socialPost.workspaceId,
      to: r.workspace.id,
      optional: true,
    }),
    media: r.many.socialPostMedia(),
  },
  socialPostMedia: {
    post: r.one.socialPost({
      from: r.socialPostMedia.socialPostId,
      to: r.socialPost.id,
      optional: false,
    }),
  },
  workflow: {
    user: r.one.user({
      from: r.workflow.userId,
      to: r.user.id,
      optional: false,
    }),
    workspace: r.one.workspace({
      from: r.workflow.workspaceId,
      to: r.workspace.id,
      optional: true,
    }),
    runs: r.many.workflowRun(),
  },
  workflowRun: {
    workflow: r.one.workflow({
      from: r.workflowRun.workflowId,
      to: r.workflow.id,
      optional: false,
    }),
    steps: r.many.workflowRunStep(),
  },
  workflowRunStep: {
    run: r.one.workflowRun({
      from: r.workflowRunStep.runId,
      to: r.workflowRun.id,
      optional: false,
    }),
  },
  notification: {
    user: r.one.user({
      from: r.notification.userId,
      to: r.user.id,
      optional: false,
    }),
  },
  workspace: {
    owner: r.one.user({
      from: r.workspace.ownerId,
      to: r.user.id,
      optional: false,
    }),
    agents: r.many.agent(),
    chats: r.many.chat(),
    genImages: r.many.genImage(),
    socialPosts: r.many.socialPost(),
    workflows: r.many.workflow(),
    datasets: r.many.dataset(),
  },
}));
