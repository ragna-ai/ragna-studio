import type { AnyToolDefinition, ToolSet } from '@repo/ai';
import {
  buildAgentInstructions,
  buildAgentToolset,
  buildCloudDriveToolApproval,
  generateText,
  getLanguageModel,
  hasToolCall,
  normalizeUsage,
  stepCountIs,
  toAgentTools,
  toModelSettings,
  withCachedInstructions,
  withDefaultProviderOptions,
} from '@repo/ai';
import type { AgentVersionConfig, AiModelPricing } from '@repo/database';
import { computeCharge, getAiModelById } from '@repo/database';
import type { WorkflowAgentTraceStep, WorkflowTokenUsage } from '@repo/workflow';
import type { GenerateTextStep, GenerateTextSteps } from './agent-trace';
import { collectTrace, logTraceStepDebug, toWorkflowUsage } from './agent-trace';
import type { UsageCharge } from './credit-gate';
import { gateCreditSpend, settleUsageCharge } from './credit-gate';

/** What the run has done so far, handed to `beforeStep` and `onStep`. */
export interface UnattendedAgentProgress {
  trace: WorkflowAgentTraceStep[];
  usage: UnattendedAgentUsage;
}

export interface UnattendedAgentUsage {
  inputTokens: number;
  outputTokens: number;
  /** What settlement would charge for the run so far. Zero while credits are off. */
  microCredits: bigint;
}

export interface UnattendedAgentRun {
  agentId: string;
  workspaceId: string;
  /** The user the run acts as: tool calls use their connections and permissions. */
  userId: string;
  /** The configuration to run, never read from the live agent row by the runner. */
  config: AgentVersionConfig;
  prompt: string;
  charge: UsageCharge;
  maxSteps: number;
  abortSignal?: AbortSignal;
  /** Ends the loop after a step that calls this tool. */
  stopAfterToolName?: string;
  /** Tools only this kind of run has, added next to the granted ones. */
  extraToolDefinitions?: readonly AnyToolDefinition[];
  /** Tools that chat gates behind a user approval answer with a failure instead of running. */
  refuseApprovalTools?: boolean;
  /** Names of the tools that change data. */
  writeToolNames?: ReadonlySet<string>;
  /**
   * Runs before each call of a write tool, and the tool only runs once it has finished. When it
   * throws, the tool does not run and the run ends before its next step with that error.
   */
  onBeforeWrite?: () => Promise<void>;
  /** Task tools refuse to create tasks. */
  inTaskRun?: boolean;
  /** Names the run in the debug log. */
  logLabel: string;
  /** Runs before each step. Throw to stop the run. */
  beforeStep?: (progress: UnattendedAgentProgress) => Promise<void>;
  /** Runs after each step. */
  onStep?: (progress: UnattendedAgentProgress) => Promise<void>;
}

export interface UnattendedAgentResult {
  text: string;
  /** The loop ended on the step budget while the agent still wanted to call tools. */
  hitStepLimit: boolean;
  trace: WorkflowAgentTraceStep[];
  usage: WorkflowTokenUsage;
}

function toApprovalRefusals(tools: ToolSet): ToolSet {
  const refused = Object.keys(buildCloudDriveToolApproval(tools));
  const refusals = refused.map((name): [string, ToolSet[string]] => [
    name,
    {
      ...tools[name],
      execute: async () => ({
        status: 'needs_approval',
        message: `${name} needs a person's approval, which a task run cannot ask for. Describe what you wanted to do in your summary. Nothing was changed.`,
      }),
    },
  ]);
  return { ...tools, ...Object.fromEntries(refusals) };
}

function withWriteMarker({
  tools,
  writeToolNames,
  onBeforeWrite,
}: {
  tools: ToolSet;
  writeToolNames: ReadonlySet<string>;
  onBeforeWrite: () => Promise<void>;
}): ToolSet {
  const entries = Object.entries(tools).map(([name, definition]): [string, ToolSet[string]] => {
    const execute = definition.execute;
    if (!writeToolNames.has(name) || !execute) return [name, definition];
    return [
      name,
      {
        ...definition,
        execute: async (...args: Parameters<typeof execute>) => {
          await onBeforeWrite();
          return execute(...args);
        },
      },
    ];
  });
  return Object.fromEntries(entries);
}

function sumUsage({
  model,
  steps,
}: {
  model: { provider: string; pricing: AiModelPricing | null };
  steps: GenerateTextSteps;
}): UnattendedAgentUsage {
  const usage = normalizeUsage(model.provider, steps);
  const microCredits =
    model.pricing?.kind === 'token'
      ? computeCharge({ pricing: model.pricing, ...usage }).chargedMicroCredits
      : 0n;
  return { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, microCredits };
}

/**
 * Runs an agent without a person watching: the chat loop with the chat's instructions and tools,
 * a step budget and one credit charge. The charge settles even when the run throws, so tokens
 * already spent are paid for.
 */
export async function runAgentUnattended(
  input: UnattendedAgentRun,
): Promise<UnattendedAgentResult> {
  const { agentId, workspaceId, userId, config: agentConfig } = input;

  const aiModel = await getAiModelById({ aiModelId: agentConfig.aiModelId });
  if (!aiModel) {
    throw new Error(`AI model "${agentConfig.aiModelId}" not found`);
  }

  const spendState = await gateCreditSpend({ workspaceId, pricing: aiModel.pricing });

  const { instructions, retrievalMode } = await buildAgentInstructions({
    agentId,
    workspaceId,
    toolIds: agentConfig.toolGrants.map((grant) => grant.id),
    systemPrompt: agentConfig.systemPrompt,
    context: agentConfig.context,
    defaultDatasetId: agentConfig.defaultDatasetId,
  });

  const toolContext = {
    userId,
    agentId,
    workspaceId,
    // The run is already in the worker, so media tools render inline instead of queueing.
    runsInWorker: true,
    retrievalMode,
    inTaskRun: input.inTaskRun,
  };
  const extraDefinitions = input.extraToolDefinitions ?? [];
  const grantedTools = buildAgentToolset(agentConfig.toolGrants, toolContext);
  const extraTools = toAgentTools(extraDefinitions, {
    toolContext: { userId, workspaceId, origin: 'agent' },
    logFields: { agentId },
  });
  const writeToolNames = input.writeToolNames ?? new Set<string>();
  const writeMarker: { failed: boolean; error?: unknown } = { failed: false };
  const { onBeforeWrite } = input;
  const markedTools = onBeforeWrite
    ? withWriteMarker({
        tools: { ...grantedTools, ...extraTools },
        writeToolNames,
        onBeforeWrite: async () => {
          try {
            await onBeforeWrite();
          } catch (error) {
            writeMarker.failed = true;
            writeMarker.error = error;
            throw error;
          }
        },
      })
    : { ...grantedTools, ...extraTools };
  const tools = input.refuseApprovalTools ? toApprovalRefusals(markedTools) : markedTools;

  const progressOf = (steps: GenerateTextSteps): UnattendedAgentProgress => ({
    trace: collectTrace(steps),
    usage: sumUsage({ model: aiModel, steps }),
  });

  const finishedSteps: GenerateTextStep[] = [];
  const logStep = logTraceStepDebug(input.logLabel);
  const modelSettings = toModelSettings(agentConfig.settings);
  const startedAt = Date.now();

  try {
    const result = await generateText({
      model: getLanguageModel({ provider: aiModel.provider, model: aiModel.model }),
      instructions: withCachedInstructions(instructions),
      prompt: input.prompt,
      providerOptions: withDefaultProviderOptions(),
      tools,
      temperature: modelSettings.temperature,
      maxOutputTokens: modelSettings.maxOutputTokens,
      reasoning: modelSettings.reasoning,
      abortSignal: input.abortSignal,
      stopWhen: [
        stepCountIs(input.maxSteps),
        ...(input.stopAfterToolName ? [hasToolCall(input.stopAfterToolName)] : []),
      ],
      prepareStep: async ({ steps }) => {
        if (writeMarker.failed) throw writeMarker.error;
        await input.beforeStep?.(progressOf(steps));
        return undefined;
      },
      onStepFinish: async (step) => {
        logStep(step);
        finishedSteps.push(step);
        await input.onStep?.(progressOf(finishedSteps));
      },
    });

    if (writeMarker.failed) throw writeMarker.error;

    return {
      text: result.text,
      hitStepLimit: result.steps.length >= input.maxSteps && result.finishReason === 'tool-calls',
      trace: collectTrace(result.steps),
      usage: toWorkflowUsage(result.usage),
    };
  } finally {
    await settleUsageCharge({
      spendState,
      workspaceId,
      userId,
      aiModelId: agentConfig.aiModelId,
      provider: aiModel.provider,
      steps: finishedSteps,
      charge: input.charge,
      durationMs: Date.now() - startedAt,
    });
  }
}
