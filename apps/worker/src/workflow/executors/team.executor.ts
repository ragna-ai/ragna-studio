import {
  buildAgentInstructions,
  buildAgentToolset,
  generateText,
  getLanguageModel,
  getSearchContextDocumentsTool,
  stepCountIs,
  tool,
  toModelSettings,
  z,
} from '@repo/ai';
import type { ToolSet } from '@repo/ai';
import type { AiModelPricing } from '@repo/database';
import { getAgentById, getDefaultAgent } from '@repo/database';
import type { TeamConfig } from '@repo/workflow';
import { resolveTemplate } from '@repo/workflow';
import { noopWriter } from './noop-writer';
import type { DelegateCallMeta } from './run-referenced-agent';
import {
  collectTrace,
  gateCreditSpend,
  InsufficientCreditsError,
  logTraceStepDebug,
  ModelNotChargeableError,
  runReferencedAgent,
  settleWorkflowUsage,
  withAiModel,
} from './run-referenced-agent';
import type { Executor, ExecutorContext } from './types';

type ResolvedMember = {
  agentId: string;
  role: string;
  name: string;
};

async function resolveMembers(
  members: TeamConfig['members'],
  ctx: ExecutorContext,
): Promise<ResolvedMember[]> {
  return Promise.all(
    members.map(async (member) => {
      const agentRecord = await getAgentById({ agentId: member.agentId, userId: ctx.userId });
      if (!agentRecord) {
        throw new Error(`Agent "${member.agentId}" not found for this user`);
      }
      return { agentId: member.agentId, role: member.role, name: agentRecord.name };
    }),
  );
}

// delegate_to_<slug>, slug from the member's agent name. A numeric suffix
// breaks collisions, since the same agent can be a member twice with
// different roles.
function slugifyAgentName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function assignToolNames(members: ResolvedMember[]): string[] {
  const usedSlugs = new Set<string>();

  return members.map((member) => {
    const baseSlug = slugifyAgentName(member.name) || 'member';
    let slug = baseSlug;
    let suffix = 2;
    while (usedSlugs.has(slug)) {
      slug = `${baseSlug}_${suffix}`;
      suffix += 1;
    }
    usedSlugs.add(slug);
    return `delegate_to_${slug}`;
  });
}

// Appended to a referenced lead's own instructions, or used alone for the
// default-agent lead: the member roster and the delegation protocol.
function buildTeamBriefing(members: ResolvedMember[]): string {
  // The role may be empty (draft save allows it); the name alone still
  // gives the lead something to route by.
  const roster = members
    .map((member) => (member.role ? `- ${member.name}: ${member.role}` : `- ${member.name}`))
    .join('\n');

  return [
    'You lead a small team of specialist agents. Delegate work to them with',
    'the delegate_to_* tools; each tool routes to exactly one member.',
    '',
    'Team members:',
    roster,
    '',
    'Break the task into subtasks, delegate each to the member whose role',
    'fits it, and review what comes back. Re-delegate or refine if a report',
    'is incomplete. Once you are satisfied, write the final answer yourself',
    'instead of delegating it.',
  ].join('\n');
}

// One delegate tool per member. Running a member reuses the same
// referenced-agent path as the agent node (full toolset, stepCountIs(15)),
// including its credit gate and settlement. Each call's duration, usage, and
// member tool calls (kept flat, not a nested trace) are recorded by
// toolCallId so they can be attached to the lead's own trace once the
// lead's loop finishes; the same toolCallId also makes this call's charge
// unique among the node's other delegate calls (docs/credits/prd.md, "Call
// sites").
//
// A member's `runReferencedAgent` call can throw InsufficientCreditsError or
// ModelNotChargeableError from its own gate. Left alone, the AI SDK turns
// that into a 'tool-error' content part and the lead's loop just keeps
// going, degrading the run instead of failing it. So the error is also
// stashed via `onCreditError` and `abortController` is aborted, which stops
// the lead's own generateText call; the tool still rethrows so the failed
// delegate call is visible in the trace either way.
function buildDelegateTools(
  members: ResolvedMember[],
  toolNames: string[],
  ctx: ExecutorContext,
  nodeId: string,
  delegateCallMetaByToolCallId: Map<string, DelegateCallMeta>,
  abortController: AbortController,
  onCreditError: (error: InsufficientCreditsError | ModelNotChargeableError) => void,
): ToolSet {
  const entries = members.map((member, index) => {
    const toolName = toolNames[index];
    const delegateTool = tool({
      description: member.role
        ? `Delegate a task to ${member.name}. Role: ${member.role}`
        : `Delegate a task to ${member.name}.`,
      inputSchema: z.object({ task: z.string() }),
      execute: async ({ task }, { toolCallId }) => {
        const startedAt = Date.now();
        try {
          const { text, trace, usage } = await runReferencedAgent({
            agentId: member.agentId,
            userId: ctx.userId,
            workspaceId: ctx.workspaceId,
            prompt: task,
            runId: ctx.runId,
            nodeId,
            callId: toolCallId,
            feature: 'team',
          });
          const memberToolCalls = trace.flatMap((step) => step.toolCalls);
          delegateCallMetaByToolCallId.set(toolCallId, {
            calls: memberToolCalls.length > 0 ? memberToolCalls : undefined,
            durationMs: Date.now() - startedAt,
            usage,
          });
          return text;
        } catch (error) {
          if (error instanceof InsufficientCreditsError || error instanceof ModelNotChargeableError) {
            onCreditError(error);
            abortController.abort();
          }
          throw error;
        }
      },
    });
    return [toolName, delegateTool] as const;
  });

  return Object.fromEntries(entries);
}

type LeadSetup = {
  model: ReturnType<typeof getLanguageModel>;
  instructions: string;
  ownTools: ToolSet;
  modelSettings: ReturnType<typeof toModelSettings>;
  // Carried alongside `model` (rather than re-derived from it) so the lead's
  // own generateText call can be settled the same way runReferencedAgent
  // settles a member call: settleWorkflowUsage needs the model id and
  // provider string as plain values, not baked into the SDK's model object.
  aiModelId: string;
  provider: string;
  // The lead's model pricing, so the lead's own gate call can refuse an
  // unpriced model before generateText runs (docs/credits/prd.md,
  // "Pricing"), same reasoning as `aiModelId`/`provider` above.
  pricing: AiModelPricing | null;
};

async function resolveReferencedLead(
  leadAgentId: string,
  ctx: ExecutorContext,
  briefing: string,
): Promise<LeadSetup> {
  const agentRecord = await getAgentById({ agentId: leadAgentId, userId: ctx.userId });
  if (!agentRecord) {
    throw new Error(`Agent "${leadAgentId}" not found for this user`);
  }
  const lead = withAiModel(agentRecord);
  const { instructions, retrievalMode } = await buildAgentInstructions({
    agentId: leadAgentId,
    userId: ctx.userId,
    tools: lead.tools,
    systemPrompt: lead.systemPrompt,
    context: lead.context,
    defaultDatasetId: lead.defaultDatasetId,
  });

  return {
    model: getLanguageModel({ provider: lead.aiModel.provider, model: lead.aiModel.model }),
    instructions: `${instructions}\n\n${briefing}`,
    // The lead keeps its own configured toolset next to the delegate tools,
    // so it can e.g. read its pinned dataset to plan and route work instead
    // of delegating reads to members that lack access.
    ownTools: {
      ...buildAgentToolset(lead.tools, noopWriter, {
        userId: ctx.userId,
        agentId: leadAgentId,
        workspaceId: ctx.workspaceId,
        // Workflows already run inside the worker process and need the video
        // to exist before downstream steps run, so the video-gen tool awaits
        // the render inline instead of the chat fire-and-forget path
        // (docs/videogen/prd.md decision 2).
        awaitGeneration: true,
      }),
      // Wired automatically in retrieval mode, not part of the agent's own
      // tool checklist (docs/agent/agent-context-retrieval.md, "Search tool").
      ...(retrievalMode
        ? { searchContextDocuments: getSearchContextDocumentsTool(noopWriter, leadAgentId) }
        : {}),
    },
    modelSettings: toModelSettings(lead.settings),
    aiModelId: lead.aiModelId,
    provider: lead.aiModel.provider,
    pricing: lead.aiModel.pricing,
  };
}

async function resolveDefaultLead(briefing: string): Promise<LeadSetup> {
  const defaultAgent = withAiModel(await getDefaultAgent());

  return {
    model: getLanguageModel({
      provider: defaultAgent.aiModel.provider,
      model: defaultAgent.aiModel.model,
    }),
    instructions: briefing,
    // Only a referenced lead brings its own tools and settings; the default
    // agent runs plain, same as the agent node's inline path.
    ownTools: {},
    modelSettings: toModelSettings(undefined),
    aiModelId: defaultAgent.aiModelId,
    provider: defaultAgent.aiModel.provider,
    pricing: defaultAgent.aiModel.pricing,
  };
}

export const executeTeam: Executor = async (node, ctx) => {
  const config = node.data.config as TeamConfig;
  const prompt = resolveTemplate(config.prompt, ctx);

  const members = await resolveMembers(config.members, ctx);
  const toolNames = assignToolNames(members);
  const briefing = buildTeamBriefing(members);

  const { model, instructions, ownTools, modelSettings, aiModelId, provider, pricing } =
    config.leadAgentId
      ? await resolveReferencedLead(config.leadAgentId, ctx, briefing)
      : await resolveDefaultLead(briefing);

  // Gate the lead's own call once its model (and pricing) is known. Each
  // member's delegate call gets its own independent gate inside
  // runReferencedAgent; this one covers the lead's own generateText call
  // below, which is a separate spend (docs/credits/prd.md: "Every text LLM
  // call made on a user's behalf in chat and workflows debits their credit
  // account").
  const spendState = await gateCreditSpend({ workspaceId: ctx.workspaceId, pricing });

  const delegateCallMetaByToolCallId = new Map<string, DelegateCallMeta>();
  // Aborts the lead's own generateText loop the moment a delegate call hits
  // its credit gate mid-run, so the run fails with a distinguishable reason
  // instead of the lead looping over failing delegates and burning more of
  // the user's balance (see buildDelegateTools above).
  const abortController = new AbortController();
  let creditError: InsufficientCreditsError | ModelNotChargeableError | undefined;
  const delegateTools = buildDelegateTools(
    members,
    toolNames,
    ctx,
    node.id,
    delegateCallMetaByToolCallId,
    abortController,
    (error) => {
      creditError = error;
    },
  );

  const startedAt = Date.now();
  let result: Awaited<ReturnType<typeof generateText>>;
  try {
    result = await generateText({
      model,
      instructions,
      prompt,
      // No collision risk: delegate tool names all carry the delegate_to_
      // prefix, which no agent tool id uses.
      tools: { ...ownTools, ...delegateTools },
      // Worst case is large (12 lead steps, each fanning out to members that
      // each get their own 15-step budget); acceptable for now, quotas come
      // later with billing.
      stopWhen: stepCountIs(12),
      abortSignal: abortController.signal,
      onStepFinish: logTraceStepDebug('team lead', delegateCallMetaByToolCallId),
      ...modelSettings,
    });
  } catch (error) {
    // A credit error aborts the signal above, which makes generateText
    // reject; surface the original credit error rather than an AbortError so
    // the run step's message is distinguishable (docs/credits/prd.md, "Call
    // sites"). Any other rejection (no credit error captured) is rethrown
    // as-is. Either way, settleWorkflowUsage below is never reached, so the
    // lead's aborted partial run is not settled: v1 charges nothing for
    // aborted/failed runs (docs/credits/prd.md, "Non-goals").
    throw creditError ?? error;
  }

  await settleWorkflowUsage({
    spendState,
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    aiModelId,
    provider,
    steps: result.steps,
    feature: 'team',
    runId: ctx.runId,
    nodeId: node.id,
    // Distinguishes the lead's own charge from its members' delegate calls
    // under the same runId/nodeId; a fixed literal is safe here since it
    // can never collide with an AI SDK toolCallId.
    callId: 'lead',
    durationMs: Date.now() - startedAt,
  });

  const trace = collectTrace(result.steps, delegateCallMetaByToolCallId);

  return { output: result.text, trace: trace.length > 0 ? trace : undefined };
};
