import { defineRelations } from 'drizzle-orm';
import { account } from './account.schema';
import { agentContextDocumentChunk } from './agent-context-document-chunk.schema';
import { agentContextDocument } from './agent-context-document.schema';
import { agent, agentTemplate } from './agent.schema';
import { aiModel } from './aimodel.schema';
import { chat, chatMessage } from './chat.schema';
import { creditAccount, creditLedger, creditUsageEvent } from './credit.schema';
import { dataset, datasetRow } from './dataset.schema';
import { document } from './document.schema';
import { folder } from './folder.schema';
import { genImage, genImageReference } from './genimage.schema';
import { genVideo } from './genvideo.schema';
import { chatAttachment, media } from './media.schema';
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
  agentContextDocumentChunk,
  chat,
  chatMessage,
  creditAccount,
  creditLedger,
  creditUsageEvent,
  dataset,
  datasetRow,
  document,
  folder,
  genImage,
  genImageReference,
  genVideo,
  media,
  chatAttachment,
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
    // Personal-library flow (docs/media-library/prd.md); unused until v2
    // starts writing ownerUserId.
    media: r.many.media(),
    // Optional: not every user has a credit account yet, since accounts are
    // created only by grantCredits, never lazily (docs/credits/prd.md,
    // "Account creation").
    creditAccount: r.one.creditAccount({
      from: r.user.id,
      to: r.creditAccount.userId,
      optional: true,
    }),
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
    usageEvents: r.many.creditUsageEvent(),
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
    contextDocumentChunks: r.many.agentContextDocumentChunk(),
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
    chunks: r.many.agentContextDocumentChunk(),
  },
  agentContextDocumentChunk: {
    document: r.one.agentContextDocument({
      from: r.agentContextDocumentChunk.documentId,
      to: r.agentContextDocument.id,
      optional: false,
    }),
    agent: r.one.agent({
      from: r.agentContextDocumentChunk.agentId,
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
    attachments: r.many.chatAttachment(),
  },
  chatMessage: {
    chat: r.one.chat({
      from: r.chatMessage.chatId,
      to: r.chat.id,
      optional: false,
    }),
  },
  chatAttachment: {
    chat: r.one.chat({
      from: r.chatAttachment.chatId,
      to: r.chat.id,
      optional: false,
    }),
    media: r.one.media({
      from: r.chatAttachment.mediaId,
      to: r.media.id,
      optional: false,
    }),
  },
  creditAccount: {
    user: r.one.user({
      from: r.creditAccount.userId,
      to: r.user.id,
      optional: false,
    }),
    ledgerEntries: r.many.creditLedger(),
    usageEvents: r.many.creditUsageEvent(),
  },
  creditLedger: {
    creditAccount: r.one.creditAccount({
      from: r.creditLedger.creditAccountId,
      to: r.creditAccount.id,
      optional: false,
    }),
    // Nullable: lets a ledger row be traced to its detail when debugging,
    // not used to power any list view (docs/credits/prd.md, "Schema").
    usageEvent: r.one.creditUsageEvent({
      from: r.creditLedger.usageEventId,
      to: r.creditUsageEvent.id,
      optional: true,
    }),
  },
  creditUsageEvent: {
    creditAccount: r.one.creditAccount({
      from: r.creditUsageEvent.creditAccountId,
      to: r.creditAccount.id,
      optional: false,
    }),
    workspace: r.one.workspace({
      from: r.creditUsageEvent.workspaceId,
      to: r.workspace.id,
      optional: false,
    }),
    user: r.one.user({
      from: r.creditUsageEvent.userId,
      to: r.user.id,
      optional: true,
    }),
    aiModel: r.one.aiModel({
      from: r.creditUsageEvent.aiModelId,
      to: r.aiModel.id,
      optional: true,
    }),
    ledgerEntries: r.many.creditLedger(),
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
    // The generated output's media row (docs/media-library/migration-prd.md).
    // Optional like genVideo.media below: null until the worker uploads the
    // output (docs/imagegen/worker-execution-prd.md decision 1).
    media: r.one.media({
      from: r.genImage.mediaId,
      to: r.media.id,
      optional: true,
    }),
    references: r.many.genImageReference(),
  },
  genImageReference: {
    genImage: r.one.genImage({
      from: r.genImageReference.genImageId,
      to: r.genImage.id,
      optional: false,
    }),
    media: r.one.media({
      from: r.genImageReference.mediaId,
      to: r.media.id,
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
    // Two distinct FKs to media (output vs. first frame), so the reverse
    // "many" side on media below needs an alias per FK to disambiguate.
    media: r.one.media({
      from: r.genVideo.mediaId,
      to: r.media.id,
      optional: true,
      alias: 'genVideoMedia',
    }),
    frameMedia: r.one.media({
      from: r.genVideo.frameMediaId,
      to: r.media.id,
      optional: true,
      alias: 'genVideoFrameMedia',
    }),
    // Self-relation for draft/enhance (docs/videogen/prd-v2.md decision 1).
    // Same alias pairing as task.schema.ts's parentTask/subtasks.
    parentGenVideo: r.one.genVideo({
      from: r.genVideo.parentGenVideoId,
      to: r.genVideo.id,
      optional: true,
      alias: 'genVideoParentEnhances',
    }),
    enhances: r.many.genVideo({ alias: 'genVideoParentEnhances' }),
  },
  media: {
    ownerUser: r.one.user({
      from: r.media.ownerUserId,
      to: r.user.id,
      optional: true,
    }),
    ownerWorkspace: r.one.workspace({
      from: r.media.ownerWorkspaceId,
      to: r.workspace.id,
      optional: true,
    }),
    chatAttachments: r.many.chatAttachment(),
    genImages: r.many.genImage(),
    genImageReferences: r.many.genImageReference(),
    genVideos: r.many.genVideo({ alias: 'genVideoMedia' }),
    genVideoFrames: r.many.genVideo({ alias: 'genVideoFrameMedia' }),
    socialPostMedia: r.many.socialPostMedia(),
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
    media: r.one.media({
      from: r.socialPostMedia.mediaId,
      to: r.media.id,
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
    // Chat attachments write ownerWorkspaceId in v1 (docs/media-library/prd.md).
    media: r.many.media(),
    tasks: r.many.task(),
    taskLabels: r.many.taskLabel(),
    // The account that pays for work done here is resolved through
    // `ownerId`, not this relation; it exists for the audit trail only
    // (docs/credits/prd.md, "Billing entity resolution").
    creditUsageEvents: r.many.creditUsageEvent(),
  },
}));
