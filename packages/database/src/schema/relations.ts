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
import {
  emailAccount,
  emailAutoDraftSender,
  emailCategory,
  emailDraft,
  emailMessage,
  emailMessageBody,
  emailThread,
} from './email.schema';
import { folder } from './folder.schema';
import { genImage, genImageReference } from './genimage.schema';
import { genVideo } from './genvideo.schema';
import { chatAttachment, media } from './media.schema';
import { mcpConnection, mcpSettings, mcpToolCall } from './mcp.schema';
import { agentMemory } from './memory.schema';
import { notification } from './notification.schema';
import {
  jwks,
  oauthAccessToken,
  oauthClient,
  oauthClientAssertion,
  oauthClientResource,
  oauthConsent,
  oauthRefreshToken,
  oauthResource,
} from './oauth-provider.schema';
import { session } from './session.schema';
import { socialPost, socialPostMedia } from './social-post.schema';
import { task, taskAttachment, taskLabel, taskToTaskLabel } from './task.schema';
import { invitation, member, organization } from './organization.schema';
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
  emailAccount,
  emailCategory,
  emailAutoDraftSender,
  emailThread,
  emailMessage,
  emailMessageBody,
  emailDraft,
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
  taskAttachment,
  taskLabel,
  taskToTaskLabel,
  workspace,
  organization,
  member,
  invitation,
  jwks,
  oauthClient,
  oauthResource,
  oauthClientResource,
  oauthRefreshToken,
  oauthAccessToken,
  oauthConsent,
  oauthClientAssertion,
  mcpSettings,
  mcpConnection,
  mcpToolCall,
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
    memberships: r.many.member(),
    datasets: r.many.dataset(),
    documents: r.many.document(),
    // Personal-library flow; unused until v2
    // starts writing ownerUserId.
    media: r.many.media(),
    // Optional: not every user has a credit account yet, since accounts are
    // created only by grantCredits, never lazily.
    creditAccount: r.one.creditAccount({
      from: r.user.id,
      to: r.creditAccount.userId,
      optional: true,
    }),
    // One row per user,
    // optional: most users never connect Gmail.
    emailAccount: r.one.emailAccount({
      from: r.user.id,
      to: r.emailAccount.userId,
      optional: true,
    }),
    // MCP: one settings row per user, created on first
    // opt-in; several connections, one per connected client (P9).
    mcpSettings: r.one.mcpSettings({
      from: r.user.id,
      to: r.mcpSettings.userId,
      optional: true,
    }),
    mcpConnections: r.many.mcpConnection(),
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
  organization: {
    members: r.many.member(),
    invitations: r.many.invitation(),
    workspaces: r.many.workspace(),
    creditAccount: r.one.creditAccount({
      from: r.organization.id,
      to: r.creditAccount.organizationId,
      optional: true,
    }),
  },
  member: {
    organization: r.one.organization({
      from: r.member.organizationId,
      to: r.organization.id,
      optional: false,
    }),
    user: r.one.user({
      from: r.member.userId,
      to: r.user.id,
      optional: false,
    }),
  },
  invitation: {
    organization: r.one.organization({
      from: r.invitation.organizationId,
      to: r.organization.id,
      optional: false,
    }),
    inviter: r.one.user({
      from: r.invitation.inviterId,
      to: r.user.id,
      optional: false,
    }),
  },
  jwks: {},
  oauthClient: {
    user: r.one.user({
      from: r.oauthClient.userId,
      to: r.user.id,
      optional: true,
    }),
    accessTokens: r.many.oauthAccessToken(),
    refreshTokens: r.many.oauthRefreshToken(),
    consents: r.many.oauthConsent(),
    resourceLinks: r.many.oauthClientResource(),
  },
  oauthResource: {
    clientLinks: r.many.oauthClientResource(),
  },
  oauthClientResource: {
    client: r.one.oauthClient({
      from: r.oauthClientResource.clientId,
      to: r.oauthClient.clientId,
      optional: false,
    }),
    resource: r.one.oauthResource({
      from: r.oauthClientResource.resourceId,
      to: r.oauthResource.identifier,
      optional: false,
    }),
  },
  oauthRefreshToken: {
    client: r.one.oauthClient({
      from: r.oauthRefreshToken.clientId,
      to: r.oauthClient.clientId,
      optional: false,
    }),
    session: r.one.session({
      from: r.oauthRefreshToken.sessionId,
      to: r.session.id,
      optional: true,
    }),
    user: r.one.user({
      from: r.oauthRefreshToken.userId,
      to: r.user.id,
      optional: false,
    }),
    accessTokens: r.many.oauthAccessToken(),
  },
  oauthAccessToken: {
    client: r.one.oauthClient({
      from: r.oauthAccessToken.clientId,
      to: r.oauthClient.clientId,
      optional: false,
    }),
    session: r.one.session({
      from: r.oauthAccessToken.sessionId,
      to: r.session.id,
      optional: true,
    }),
    user: r.one.user({
      from: r.oauthAccessToken.userId,
      to: r.user.id,
      optional: true,
    }),
    refreshToken: r.one.oauthRefreshToken({
      from: r.oauthAccessToken.refreshId,
      to: r.oauthRefreshToken.id,
      optional: true,
    }),
  },
  oauthConsent: {
    client: r.one.oauthClient({
      from: r.oauthConsent.clientId,
      to: r.oauthClient.clientId,
      optional: false,
    }),
    user: r.one.user({
      from: r.oauthConsent.userId,
      to: r.user.id,
      optional: true,
    }),
  },
  oauthClientAssertion: {},
  mcpSettings: {
    user: r.one.user({
      from: r.mcpSettings.userId,
      to: r.user.id,
      optional: false,
    }),
  },
  mcpConnection: {
    user: r.one.user({
      from: r.mcpConnection.userId,
      to: r.user.id,
      optional: false,
    }),
    workspace: r.one.workspace({
      from: r.mcpConnection.workspaceId,
      to: r.workspace.id,
      optional: false,
    }),
    client: r.one.oauthClient({
      from: r.mcpConnection.clientId,
      to: r.oauthClient.clientId,
      optional: true,
    }),
    toolCalls: r.many.mcpToolCall(),
  },
  mcpToolCall: {
    connection: r.one.mcpConnection({
      from: r.mcpToolCall.connectionId,
      to: r.mcpConnection.id,
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
    // Reverse of email_accounts.defaultAgentId.
    defaultForEmailAccounts: r.many.emailAccount(),
    emailDrafts: r.many.emailDraft(),
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
    // Branching provenance. Aliased because both
    // are second relations between the chat<->chat / chat<->chatMessage
    // table pairs (alongside the self-FK-less pair above and `messages`).
    forkedFromChat: r.one.chat({
      from: r.chat.forkedFromChatId,
      to: r.chat.id,
      optional: true,
      alias: 'chatForkedFromChat',
    }),
    forkedFromMessage: r.one.chatMessage({
      from: r.chat.forkedFromMessageId,
      to: r.chatMessage.id,
      optional: true,
      alias: 'chatForkedFromMessage',
    }),
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
    // not used to power any list view.
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
  emailAccount: {
    user: r.one.user({
      from: r.emailAccount.userId,
      to: r.user.id,
      optional: false,
    }),
    defaultAgent: r.one.agent({
      from: r.emailAccount.defaultAgentId,
      to: r.agent.id,
      optional: true,
    }),
    threads: r.many.emailThread(),
    categories: r.many.emailCategory(),
    autoDraftSenders: r.many.emailAutoDraftSender(),
    drafts: r.many.emailDraft(),
  },
  emailCategory: {
    account: r.one.emailAccount({
      from: r.emailCategory.accountId,
      to: r.emailAccount.id,
      optional: false,
    }),
    messages: r.many.emailMessage(),
  },
  emailAutoDraftSender: {
    account: r.one.emailAccount({
      from: r.emailAutoDraftSender.accountId,
      to: r.emailAccount.id,
      optional: false,
    }),
  },
  emailThread: {
    account: r.one.emailAccount({
      from: r.emailThread.accountId,
      to: r.emailAccount.id,
      optional: false,
    }),
    messages: r.many.emailMessage(),
    drafts: r.many.emailDraft(),
  },
  emailMessage: {
    account: r.one.emailAccount({
      from: r.emailMessage.accountId,
      to: r.emailAccount.id,
      optional: false,
    }),
    thread: r.one.emailThread({
      from: r.emailMessage.threadId,
      to: r.emailThread.id,
      optional: false,
    }),
    category: r.one.emailCategory({
      from: r.emailMessage.categoryId,
      to: r.emailCategory.id,
      optional: true,
    }),
    body: r.one.emailMessageBody(),
    replyDrafts: r.many.emailDraft(),
  },
  emailMessageBody: {
    message: r.one.emailMessage({
      from: r.emailMessageBody.messageId,
      to: r.emailMessage.id,
      optional: false,
    }),
  },
  emailDraft: {
    account: r.one.emailAccount({
      from: r.emailDraft.accountId,
      to: r.emailAccount.id,
      optional: false,
    }),
    // Optional: `kind: 'new'` drafts have no thread yet.
    thread: r.one.emailThread({
      from: r.emailDraft.threadId,
      to: r.emailThread.id,
      optional: true,
    }),
    replyToMessage: r.one.emailMessage({
      from: r.emailDraft.replyToMessageId,
      to: r.emailMessage.id,
      optional: true,
    }),
    // Optional: `origin: 'user'` drafts have no agent.
    agent: r.one.agent({
      from: r.emailDraft.agentId,
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
    // The generated output's media row.
    // Optional like genVideo.media below: null until the worker uploads the
    // output.
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
    // Self-relation for draft/enhance.
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
    taskAttachments: r.many.taskAttachment(),
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
    // Self-relation for the one-level subtask rule.
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
    attachments: r.many.taskAttachment(),
  },
  taskAttachment: {
    task: r.one.task({
      from: r.taskAttachment.taskId,
      to: r.task.id,
      optional: false,
    }),
    media: r.one.media({
      from: r.taskAttachment.mediaId,
      to: r.media.id,
      optional: false,
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
    organization: r.one.organization({
      from: r.workspace.organizationId,
      to: r.organization.id,
      optional: true,
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
    // Chat attachments write ownerWorkspaceId in v1.
    media: r.many.media(),
    tasks: r.many.task(),
    taskLabels: r.many.taskLabel(),
    // The account that pays for work done here is resolved through
    // `organizationId`, not this relation; it exists for the audit trail only.
    creditUsageEvents: r.many.creditUsageEvent(),
  },
}));
