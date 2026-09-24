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
import {
  buildAgentInstructions,
  buildAgentToolset,
  generateText,
  getLanguageModel,
  stepCountIs,
  toModelSettings,
  withCachedInstructions,
  withDefaultProviderOptions,
} from '@repo/ai';
import type { EmailAccount, EmailMessageWithBody, EmailParticipant } from '@repo/database';
import {
  createEmailDraft,
  getAgentById,
  getEmailAccountById,
  getEmailMessageWithBodyById,
  getEmailThreadById,
  listEmailMessagesByThreadId,
  updateEmailDraft,
} from '@repo/database';
import { logger } from '@repo/logger';
import {
  buildReplyQuoteHtml,
  emailBodyToText,
  formatThreadForPrompt,
  htmlToText,
  joinDraftContentWithQuote,
  markdownToHtml,
  textToHtml,
  type ThreadPromptMessageInput,
} from '@repo/mail/content';
import type { MailAddress, MailProvider } from '@repo/mail/provider';
import type { EmailDraftJobData } from '@repo/queue';
import { noopWriter } from '../workflow/executors/noop-writer';
import { logTraceStepDebug, withAgentConfig } from '../workflow/executors/run-referenced-agent';
import { getMailProviderForAccount } from './mail-provider';
import { ensureMessageBody, persistMessageBody } from './message-body';
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

  // origin/kind are set once at creation and never change afterwards
  // (docs/email/drafts-change-request.md, "Wire contract"). Every worker-
  // generated draft is an AI reply: v1 has no auto-draft path for a new
  // message or a forward, only "Draft with AI" on an existing thread.
  const draft = await createEmailDraft({
    accountId,
    threadId,
    replyToMessageId,
    agentId,
    origin: 'ai',
    kind: 'reply',
    status: 'generating',
  });

  const provider = getMailProviderForAccount(account);

  let markdownContent: string;
  try {
    markdownContent = await runDraftAgent({ account, provider, agentId, threadId });
  } catch (error) {
    // Best-effort by design (docs/email/prd.md, "Worker jobs"): a failed
    // draft is discarded, not retried, and never fails the BullMQ job.
    logger.error(`Failed to generate email draft ${draft.id} for thread ${threadId}`, error);
    await updateEmailDraft({ id: draft.id, accountId, status: 'discarded' });
    return;
  }

  // The agent only ever writes markdown (DRAFT_TASK_INSTRUCTIONS); converted
  // to HTML once, here, so `content` is never briefly markdown in a
  // now-HTML column, e.g. if pushDraftToProvider below bails out early
  // (docs/email/html-content-change-request.md, "AI-generated drafts").
  const htmlBody = markdownToHtml(markdownContent);
  await updateEmailDraft({
    id: draft.id,
    accountId,
    status: 'ready',
    content: htmlBody,
    text: htmlToText(htmlBody),
  });

  // Pushed to the provider as soon as the draft turns 'ready', without
  // waiting for a user edit (docs/email/drafts-change-request.md,
  // "Decisions": "AI drafts to Gmail" / "Scope > 3"), so the draft is
  // reviewable from the provider's own mobile app too. Best-effort: never
  // fails this job, see pushDraftToProvider.
  await pushDraftToProvider({
    account,
    provider,
    threadId,
    replyToMessageId,
    draftId: draft.id,
    htmlBody,
  });
}

async function runDraftAgent({
  account,
  provider,
  agentId,
  threadId,
}: {
  account: EmailAccount;
  provider: MailProvider;
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
    providerOptions: withDefaultProviderOptions(),
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
    const emailText = emailBodyToText(body, { maxLength: 10_000 });
    inputs.push({
      from: toMailAddress(message.from),
      date: message.sentAt,
      subject: message.subject,
      text: emailText ?? message.snippet ?? '',
    });
  }

  return formatThreadForPrompt(inputs, { maxCharacters: MAX_DRAFT_CONTEXT_CHARS });
}

// Everything the provider push needs that comes from our own index, no
// provider call required — split out of pushDraftToProvider so that
// function reads as one linear flow instead of mixing local lookups with
// the live provider fetch that follows.
interface ReplyDraftContext {
  providerThreadId: string;
  to: EmailParticipant[];
  subject: string;
  replyToProviderMessageId: string;
  replyToFrom: MailAddress;
  replyToDate: Date;
  // Present whenever ensureMessageBody already persisted it while building
  // the agent's thread context (buildThreadContext, above) — i.e. in every
  // real case; null only for a message whose body somehow never got stored,
  // in which case pushDraftToProvider falls back to the live fetch it
  // already makes for the threading headers rather than adding a second
  // fetch path.
  replyToHtmlBody: string | null;
}

async function loadReplyDraftContext({
  account,
  threadId,
  replyToMessageId,
}: {
  account: EmailAccount;
  threadId: string;
  replyToMessageId: string;
}): Promise<ReplyDraftContext | null> {
  const thread = await getEmailThreadById({ id: threadId, accountId: account.id });
  const replyToMessage = await getEmailMessageWithBodyById({ id: replyToMessageId });
  if (!thread || !replyToMessage) {
    return null;
  }

  return {
    providerThreadId: thread.providerThreadId,
    // Default AI reply recipient is the sender being replied to, same as a
    // plain "Reply" (not "Reply all"); the review UI lets the user widen it.
    to: [replyToMessage.from],
    subject: ensureReplySubject(thread.subject),
    replyToProviderMessageId: replyToMessage.providerMessageId,
    replyToFrom: toMailAddress(replyToMessage.from),
    replyToDate: replyToMessage.sentAt,
    replyToHtmlBody: replyToMessage.body?.htmlBody ?? null,
  };
}

// A reply is conventionally prefixed once; guards against "Re: Re: Re: ..."
// piling up as more AI drafts land on the same thread over time.
function ensureReplySubject(subject: string | null): string {
  const trimmed = subject?.trim() ?? '';
  if (trimmed.length === 0) {
    return 'Re:';
  }
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

// Quoted history is appended by the system, never written by the agent
// (DRAFT_TASK_INSTRUCTIONS above explicitly forbids it), using the same
// buildReplyQuoteHtml a user reply/forward is seeded with (POST
// /email/draft), so an AI draft and a human reply on the same thread carry
// identical quoted history byte for byte, whether the draft is sent from
// the provider or from our own review UI. The quote is stored in its own
// `quotedHtml`/`quotedText` columns, separate from the agent's `content`/
// `text` (docs/email/quote-iframe-change-request.md), so the compose UI can
// render it read-only instead of parsing it into the live editor.
function buildQuoteFields({
  context,
  quoteHtmlBody,
}: {
  context: ReplyDraftContext;
  quoteHtmlBody: string;
}): { quotedHtml: string; quotedText: string } {
  const quotedHtml = buildReplyQuoteHtml({
    from: context.replyToFrom,
    date: context.replyToDate,
    html: quoteHtmlBody,
  });
  return { quotedHtml, quotedText: htmlToText(quotedHtml) };
}

// Creates the provider-side draft for an AI reply that just turned 'ready'.
// Best-effort: the draft is already usable from our own review UI once
// 'ready', so a push failure here is logged and swallowed rather than
// failing the draft job; providerDraftId simply stays null
// (docs/email/drafts-change-request.md, "Scope > 3").
async function pushDraftToProvider({
  account,
  provider,
  threadId,
  replyToMessageId,
  draftId,
  htmlBody,
}: {
  account: EmailAccount;
  provider: MailProvider;
  threadId: string;
  replyToMessageId: string;
  draftId: string;
  // Already converted from the agent's markdown output by the caller
  // (generateEmailDraft), so this function works in HTML throughout: stored
  // content, the quote, and the outgoing MIME parts.
  htmlBody: string;
}): Promise<void> {
  try {
    const context = await loadReplyDraftContext({ account, threadId, replyToMessageId });
    if (!context) {
      logger.warn(
        `Cannot push email draft ${draftId} to the provider: thread or reply-to message is missing`,
      );
      return;
    }

    // to/subject come entirely from local data (the thread row and the
    // replied-to message's sender), so they're saved before any provider
    // call below: a provider outage (expired token, network blip, replied-to
    // message gone from the mailbox) must degrade the push, never the draft
    // itself. A user opening an otherwise-fine AI draft to find it addressed
    // to nobody, with no subject, is worse than the push simply not
    // happening yet.
    await updateEmailDraft({
      id: draftId,
      accountId: account.id,
      to: context.to,
      subject: context.subject,
    });

    // Same reasoning for the quote: when the replied-to message's body is
    // already stored (the common case — the classifier persists bodies at
    // ingest), the quote is buildable from local data alone, so it's saved
    // here too, before the fetch below can fail. Only the rare storage miss
    // needs that fetch's body, handled after it succeeds. This is
    // deliberately two updateEmailDraft calls on that cold path instead of
    // collapsing into one after the fetch: a second local write is cheap,
    // and it's what buys the guarantee that a provider outage never leaves
    // the draft without a usable quote. Do not re-merge these. `content`/`text`
    // (the agent's own reply) are already saved by generateEmailDraft before
    // this function runs, so only `quotedHtml`/`quotedText` are written here.
    let quotedHtml: string | null = null;
    let quotedText: string | null = null;

    if (context.replyToHtmlBody !== null) {
      ({ quotedHtml, quotedText } = buildQuoteFields({
        context,
        quoteHtmlBody: context.replyToHtmlBody,
      }));
      await updateEmailDraft({ id: draftId, accountId: account.id, quotedHtml, quotedText });
    }

    // The RFC822 Message-ID header and References chain aren't stored on the
    // index row (only the provider's own message id is), so threading needs
    // one live metadata fetch, same as apps/api's email.service.ts
    // resolveThreading does for a user-sent reply. Its body doubles as the
    // quote source below on the rare miss where nothing was stored yet.
    const fullReplyToMessage = await provider.fetchMessage(
      context.replyToProviderMessageId,
      'full',
    );

    if (quotedHtml === null || quotedText === null) {
      // Only reached on that rare storage miss: persistMessageBody both
      // derives the canonical text/HTML pair and fills the gap for the next
      // reader, same as apps/api's quote-seeding does for a user-authored
      // reply/forward draft. A genuinely plain-text-only message has no
      // htmlBody at all (not just unsynced), so fall back through
      // `textToHtml` the same way apps/api's resolveMessageHtmlForQuote does
      // - not `markdownToHtml`, since `toCanonicalText` prefers the
      // plain-text MIME part, so this textBody is genuine plain text, not
      // markdown.
      const persistedReplyToBody = await persistMessageBody({
        messageId: replyToMessageId,
        body: fullReplyToMessage.body,
      });
      const quoteHtmlBody =
        persistedReplyToBody.htmlBody ?? textToHtml(persistedReplyToBody.textBody ?? '');
      ({ quotedHtml, quotedText } = buildQuoteFields({ context, quoteHtmlBody }));
      await updateEmailDraft({ id: draftId, accountId: account.id, quotedHtml, quotedText });
    }

    if (!fullReplyToMessage.messageIdHeader) {
      logger.warn(
        `Cannot thread email draft ${draftId} to the provider: reply-to message has no Message-ID header`,
      );
      return;
    }

    // The agent's own reply (`htmlBody`/its text form) plus the quote just
    // saved above, joined the same way apps/api's send path joins
    // `content`/`quotedHtml` (joinDraftContentWithQuote, @repo/mail/content)
    // - one shared assembly, not two independent concatenations.
    const { html, text } = joinDraftContentWithQuote({
      content: htmlBody,
      text: htmlToText(htmlBody),
      quotedHtml,
      quotedText,
    });

    const created = await provider.createDraft({
      to: context.to.map(toMailAddress),
      subject: context.subject,
      // The provider's own web/mobile UI renders the text/html part; text
      // is the plain-text MIME sibling derived from the same HTML we just
      // stored, not the markdown source (docs/email/html-content-change-
      // request.md, "Outgoing MIME assembly").
      text,
      html,
      thread: {
        threadId: context.providerThreadId,
        inReplyToMessageId: fullReplyToMessage.messageIdHeader,
        references: fullReplyToMessage.references,
        replyToProviderMessageId: context.replyToProviderMessageId,
      },
    });

    await updateEmailDraft({ id: draftId, accountId: account.id, providerDraftId: created.id });
  } catch (error) {
    logger.error(`Failed to push email draft ${draftId} to the provider`, error);
  }
}
