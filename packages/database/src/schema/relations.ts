import { defineRelations } from 'drizzle-orm';
import { account } from './account.schema';
import { agentContextDocument } from './agent-context-document.schema';
import { agent, agentTemplate } from './agent.schema';
import { aiModel } from './aimodel.schema';
import { chat, chatMessage } from './chat.schema';
import { dataset, datasetRow } from './dataset.schema';
import { document } from './document.schema';
import { folder } from './folder.schema';
import { genImage } from './genimage.schema';
import { genVideo } from './genvideo.schema';
import { agentMemory } from './memory.schema';
import { notification } from './notification.schema';
import { session } from './session.schema';
import { socialPost, socialPostMedia } from './social-post.schema';
import { task, taskLabel, taskToTaskLabel } from './task.schema';
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
  agentContextDocument,
  chat,
  chatMessage,
  dataset,
  datasetRow,
  document,
  folder,
  genImage,
  genVideo,
  socialPost,
  socialPostMedia,
  workflow,
  workflowRun,
  workflowRunStep,
  notification,
  task,
  taskLabel,
  taskToTaskLabel,
  workspace,
};

export const relations = defineRelations(schema, (r) => ({
  user: {
    accounts: r.many.account(),
    sessions: r.many.session(),
    agents: r.many.agent(),
    chats: r.many.chat(),
    genImages: r.many.genImage(),
    genVideos: r.many.genVideo(),
    socialPosts: r.many.socialPost(),
    workflows: r.many.workflow(),
    notifications: r.many.notification(),
    workspaces: r.many.workspace(),
    datasets: r.many.dataset(),
    documents: r.many.document(),
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
      optional: false,
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
    contextDocuments: r.many.agentContextDocument(),
    documents: r.many.document(),
  },
  agentMemory: {
    agent: r.one.agent({
      from: r.agentMemory.agentId,
      to: r.agent.id,
      optional: false,
    }),
  },
  agentContextDocument: {
    agent: r.one.agent({
      from: r.agentContextDocument.agentId,
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
      optional: false,
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
      optional: false,
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
  document: {
    workspace: r.one.workspace({
      from: r.document.workspaceId,
      to: r.workspace.id,
      optional: false,
    }),
    folder: r.one.folder({
      from: r.document.folderId,
      to: r.folder.id,
      optional: true,
    }),
    createdByUser: r.one.user({
      from: r.document.createdByUserId,
      to: r.user.id,
      optional: true,
    }),
    createdByAgent: r.one.agent({
      from: r.document.createdByAgentId,
      to: r.agent.id,
      optional: true,
    }),
  },
  folder: {
    workspace: r.one.workspace({
      from: r.folder.workspaceId,
      to: r.workspace.id,
      optional: false,
    }),
    documents: r.many.document(),
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
      optional: false,
    }),
  },
  genVideo: {
    user: r.one.user({
      from: r.genVideo.userId,
      to: r.user.id,
      optional: false,
    }),
    workspace: r.one.workspace({
      from: r.genVideo.workspaceId,
      to: r.workspace.id,
      optional: false,
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
      optional: false,
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
      optional: false,
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
  task: {
    workspace: r.one.workspace({
      from: r.task.workspaceId,
      to: r.workspace.id,
      optional: false,
    }),
    // Self-relation for the one-level subtask rule (docs/tasks/prd.md).
    // `alias` pairs this "one" side with the "many" side below so drizzle
    // can tell them apart from any other task<->task relation.
    parentTask: r.one.task({
      from: r.task.parentTaskId,
      to: r.task.id,
      optional: true,
      alias: 'taskParentSubtasks',
    }),
    subtasks: r.many.task({ alias: 'taskParentSubtasks' }),
    assignedAgent: r.one.agent({
      from: r.task.assignedAgentId,
      to: r.agent.id,
      optional: true,
    }),
    createdByUser: r.one.user({
      from: r.task.createdByUserId,
      to: r.user.id,
      optional: true,
    }),
    createdByAgent: r.one.agent({
      from: r.task.createdByAgentId,
      to: r.agent.id,
      optional: true,
    }),
    // Many-to-many through the tasks_to_task_labels join table.
    labels: r.many.taskLabel({
      from: r.task.id.through(r.taskToTaskLabel.taskId),
      to: r.taskLabel.id.through(r.taskToTaskLabel.taskLabelId),
    }),
  },
  taskLabel: {
    workspace: r.one.workspace({
      from: r.taskLabel.workspaceId,
      to: r.workspace.id,
      optional: false,
    }),
    tasks: r.many.task({
      from: r.taskLabel.id.through(r.taskToTaskLabel.taskLabelId),
      to: r.task.id.through(r.taskToTaskLabel.taskId),
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
    genVideos: r.many.genVideo(),
    socialPosts: r.many.socialPost(),
    workflows: r.many.workflow(),
    datasets: r.many.dataset(),
    documents: r.many.document(),
    folders: r.many.folder(),
    tasks: r.many.task(),
    taskLabels: r.many.taskLabel(),
  },
}));
