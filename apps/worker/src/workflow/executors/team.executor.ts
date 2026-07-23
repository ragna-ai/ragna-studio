import {
  buildAgentInstructions,
  buildAgentToolset,
  generateText,
  getLanguageModel,
  stepCountIs,
  tool,
  toModelSettings,
  z,
} from '@repo/ai';
import type { ToolSet } from '@repo/ai';
import { getAgentById, getDefaultAgent } from '@repo/database';
import type { TeamConfig } from '@repo/workflow';
import { resolveTemplate } from '@repo/workflow';
import { noopWriter } from './noop-writer';
import type { DelegateCallMeta } from './run-referenced-agent';
import {
  collectTrace,
  logTraceStepDebug,
  runReferencedAgent,
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
// referenced-agent path as the agent node (full toolset, stepCountIs(15)).
// Each call's duration, usage, and member tool calls (kept flat, not a
// nested trace) are recorded by toolCallId so they can be attached to the
// lead's own trace once the lead's loop finishes.
function buildDelegateTools(
  members: ResolvedMember[],
  toolNames: string[],
  ctx: ExecutorContext,
  delegateCallMetaByToolCallId: Map<string, DelegateCallMeta>,
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
        const { text, trace, usage } = await runReferencedAgent({
          agentId: member.agentId,
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          prompt: task,
        });
        const memberToolCalls = trace.flatMap((step) => step.toolCalls);
        delegateCallMetaByToolCallId.set(toolCallId, {
          calls: memberToolCalls.length > 0 ? memberToolCalls : undefined,
          durationMs: Date.now() - startedAt,
          usage,
        });
        return text;
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
  const instructions = await buildAgentInstructions({
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
    ownTools: buildAgentToolset(lead.tools, noopWriter, {
      userId: ctx.userId,
      agentId: leadAgentId,
      workspaceId: ctx.workspaceId,
      // Workflows already run inside the worker process and need the video
      // to exist before downstream steps run, so the video-gen tool awaits
      // the render inline instead of the chat fire-and-forget path
      // (docs/videogen/prd.md decision 2).
      awaitGeneration: true,
    }),
    modelSettings: toModelSettings(lead.settings),
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
  };
}

export const executeTeam: Executor = async (node, ctx) => {
  const config = node.data.config as TeamConfig;
  const prompt = resolveTemplate(config.prompt, ctx);

  const members = await resolveMembers(config.members, ctx);
  const toolNames = assignToolNames(members);
  const briefing = buildTeamBriefing(members);

  const delegateCallMetaByToolCallId = new Map<string, DelegateCallMeta>();
  const delegateTools = buildDelegateTools(members, toolNames, ctx, delegateCallMetaByToolCallId);

  const { model, instructions, ownTools, modelSettings } = config.leadAgentId
    ? await resolveReferencedLead(config.leadAgentId, ctx, briefing)
    : await resolveDefaultLead(briefing);

  const result = await generateText({
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
    onStepFinish: logTraceStepDebug('team lead', delegateCallMetaByToolCallId),
    ...modelSettings,
  });

  const trace = collectTrace(result.steps, delegateCallMetaByToolCallId);

  return { output: result.text, trace: trace.length > 0 ? trace : undefined };
};
