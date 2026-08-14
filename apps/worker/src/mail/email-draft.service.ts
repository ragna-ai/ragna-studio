// apps/worker/src/mail/email-draft.service.ts
//
// Runs the configured agent to draft a reply for a thread (docs/email/
// prd.md, "Worker jobs"), triggered either automatically by classify or by
// the manual "Draft with AI" endpoint. The draft row is created 'generating'
// before the agent runs so the UI can show progress, then flipped to
// 'ready'/'discarded' once the run settles.
//
// No credit gate/settlement here: v1's credit system (docs/credits/prd.md)
// only implements 'chat' | 'workflow' | 'team' spend, and its settlement
// helper (settleWorkflowUsage, ../workflow/executors/run-referenced-agent.ts)
// keys its idempotency/refType on a workflow run's runId/nodeId, which an
// email draft doesn't have. Charging this properly needs a new
// CreditUsageFeature value plus a non-workflow-run settlement path in
// @repo/database — out of this worker-only slice's file ownership, reported
// back instead of invented here (see PRD goal "Classify and draft calls
// account credits").
import type { EmailAccount, EmailMessageWithBody } from '@repo/database';
import {
  createEmailDraft,
  getAgentById,
  getEmailAccountById,
  listEmailMessagesByThreadId,
  updateEmailDraft,
} from '@repo/database';
import {
  buildAgentInstructions,
  buildAgentToolset,
  generateText,
  getLanguageModel,
  stepCountIs,
  toModelSettings,
  withCachedInstructions,
} from '@repo/ai';
import { logger } from '@repo/logger';
import { formatThreadForPrompt, type ThreadPromptMessageInput } from '@repo/mail/content';
import type { MailProvider } from '@repo/mail/provider';
import type { EmailDraftJobData } from '@repo/queue';
import { logTraceStepDebug, withAgentConfig } from '../workflow/executors/run-referenced-agent';
import { noopWriter } from '../workflow/executors/noop-writer';
import { getGmailProviderForAccount } from './gmail-provider';
import { ensureMessageBody } from './message-body';
import { toMailAddress } from './participants';

// Same step budget as a workflow's referenced-agent node (run-referenced-
// agent.ts): a draft can legitimately use a couple of tool calls (e.g.
// memory, datasets) before writing the reply.
const DRAFT_STEP_BUDGET = 15;
const MAX_DRAFT_CONTEXT_CHARS = 12_000;

const DRAFT_TASK_INSTRUCTIONS = [
  'Write a reply to the latest message in this email thread on behalf of the mailbox owner.',
  'Output ONLY the reply body as plain markdown: no subject line, no quoted history, no',
  '"On ... wrote:" attribution, and no invented signature unless the conversation clearly',
  'expects one. Match the tone of the thread.',
].join(' ');

export async function generateEmailDraft({
  accountId,
  threadId,
  replyToMessageId,
  agentId: overrideAgentId,
}: EmailDraftJobData): Promise<void> {
  const account = await getEmailAccountById({ id: accountId });
  if (!account) {
    logger.warn(`Email account ${accountId} not found, skipping draft for thread ${threadId}`);
    return;
  }

  const agentId = overrideAgentId ?? account.defaultAgentId;
  if (!agentId) {
    logger.warn(
      `Email account ${accountId} has no draft agent configured, skipping draft for thread ${threadId}`,
    );
    return;
  }

  const draft = await createEmailDraft({
    accountId,
    threadId,
    replyToMessageId,
    agentId,
    status: 'generating',
  });

  try {
    const content = await runDraftAgent({ account, agentId, threadId });
    await updateEmailDraft({ id: draft.id, accountId, status: 'ready', content });
  } catch (error) {
    // Best-effort by design (docs/email/prd.md, "Worker jobs"): a failed
    // draft is discarded, not retried, and never fails the BullMQ job.
    logger.error(`Failed to generate email draft ${draft.id} for thread ${threadId}`, error);
    await updateEmailDraft({ id: draft.id, accountId, status: 'discarded' });
  }
}

async function runDraftAgent({
  account,
  agentId,
  threadId,
}: {
  account: EmailAccount;
  agentId: string;
  threadId: string;
}): Promise<string> {
  const agentRecord = await getAgentById({ agentId, userId: account.userId });
  if (!agentRecord) {
    throw new Error(`Agent ${agentId} not found for user ${account.userId}`);
  }
  const agent = withAgentConfig(agentRecord);

  // Trusted threadId (the job's own payload, enqueued by classify or an
  // already-ownership-checked API endpoint), same reasoning as
  // gen-video.repo.ts's getGenVideoById: no accountId scoping needed here.
  const messages = await listEmailMessagesByThreadId({ threadId });
  if (messages.length === 0) {
    throw new Error(`Email thread ${threadId} has no messages to draft a reply to`);
  }

  const provider = getGmailProviderForAccount(account);
  const threadContext = await buildThreadContext({ provider, messages });

  const { instructions, retrievalMode } = await buildAgentInstructions({
    agentId,
    userId: account.userId,
    tools: agent.tools,
    systemPrompt: agent.systemPrompt,
    context: agent.context,
    defaultDatasetId: agentRecord.defaultDatasetId,
  });

  const tools = buildAgentToolset(agent.tools, noopWriter, {
    userId: account.userId,
    agentId,
    workspaceId: agentRecord.workspaceId,
    // The worker process runs this inline, same reasoning as
    // run-referenced-agent.ts's workflow path: no chat UI to stream to, and
    // any image/video tool call should await inline rather than queue.
    runsInWorker: true,
    retrievalMode,
  });

  const modelSettings = toModelSettings(agent.settings);

  const result = await generateText({
    model: getLanguageModel({ provider: agent.aiModel.provider, model: agent.aiModel.model }),
    instructions: withCachedInstructions(instructions),
    prompt: `${DRAFT_TASK_INSTRUCTIONS}\n\n<thread>\n${threadContext}\n</thread>`,
    tools,
    temperature: modelSettings.temperature,
    maxOutputTokens: modelSettings.maxOutputTokens,
    reasoning: modelSettings.reasoning,
    stopWhen: stepCountIs(DRAFT_STEP_BUDGET),
    onStepFinish: logTraceStepDebug(`email draft agent "${agentRecord.name}"`),
  });

  return result.text.trim();
}

// Stored bodies cover every post-connect message; ensureMessageBody fetches
// and persists the rare gap (an older, pre-connect message opened for the
// first time) live from the provider (docs/email/prd.md, "Sync model").
async function buildThreadContext({
  provider,
  messages,
}: {
  provider: MailProvider;
  messages: EmailMessageWithBody[];
}): Promise<string> {
  const inputs: ThreadPromptMessageInput[] = [];

  for (const message of messages) {
    const body = await ensureMessageBody({ provider, message });
    inputs.push({
      from: toMailAddress(message.from),
      date: message.sentAt,
      subject: message.subject,
      markdownBody: body.textBody ?? message.snippet ?? '',
    });
  }

  return formatThreadForPrompt(inputs, { maxCharacters: MAX_DRAFT_CONTEXT_CHARS });
}
