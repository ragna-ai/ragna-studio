import type { AnyToolDefinition } from '@repo/ai';
import { AGENT_TOOL_CATALOG, agentToolGrantSchema, listGrantedToolDefinitions } from '@repo/ai';
import { config } from '@repo/config';
import type { AgentVersionConfig, TaskRun } from '@repo/database';
import {
  getAiModelById,
  getTaskRunById,
  getUserConnectionByProvider,
  getWorkspaceAccess,
  resolveCreditSpendState,
} from '@repo/database';
import { findIntegration } from '@repo/integrations/catalog';
import type { WorkflowAgentTraceStep, WorkflowToolCall } from '@repo/workflow';
import type { UnattendedAgentProgress } from '../agents/unattended-agent';
import { PermanentTaskRunError, TaskRunStoppedError } from './task-run-errors';

const APPROVE_AGAIN_HINT = 'Approve the agent again to run this task.';
const STUCK_REPEAT_COUNT = 3;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

export function listToolCalls(trace: readonly WorkflowAgentTraceStep[]): WorkflowToolCall[] {
  return trace.flatMap((step) => step.toolCalls);
}

/** True when the last three tool calls share the tool and the input. */
export function isAgentStuck(trace: readonly WorkflowAgentTraceStep[]): boolean {
  const lastCalls = listToolCalls(trace).slice(-STUCK_REPEAT_COUNT);
  if (lastCalls.length < STUCK_REPEAT_COUNT) return false;
  const [first] = lastCalls;
  if (!first) return false;
  const signature = `${first.toolName}:${stableStringify(first.input)}`;
  return lastCalls.every((call) => `${call.toolName}:${stableStringify(call.input)}` === signature);
}

/** The run's own status and what the agent has done decide whether it may take another step. */
export async function assertRunMayTakeAnotherStep({
  run,
  progress,
}: {
  run: Pick<TaskRun, 'id' | 'workspaceId'>;
  progress: UnattendedAgentProgress;
}): Promise<void> {
  const current = await getTaskRunById({ workspaceId: run.workspaceId, taskRunId: run.id });
  if (current?.status !== 'running') {
    throw new TaskRunStoppedError('canceled');
  }

  if (isAgentStuck(progress.trace)) {
    throw new TaskRunStoppedError('agent_stuck');
  }

  if (!config.creditsEnabled) return;
  const spendState = await resolveCreditSpendState({ workspaceId: run.workspaceId });
  if (!spendState) return;
  const balanceAfterUnsettled = spendState.balanceMicroCredits - progress.usage.microCredits;
  if (balanceAfterUnsettled < -config.taskRunMaxOvershootMicroCredits) {
    throw new TaskRunStoppedError('credits_ran_out');
  }
}

/** The starter must still be able to open the workspace the run acts in. */
export async function assertStarterHasWorkspaceAccess(run: TaskRun): Promise<string> {
  if (!run.startedByUserId) {
    throw new PermanentTaskRunError('The user who started the run no longer exists.');
  }
  const access = await getWorkspaceAccess({
    workspaceId: run.workspaceId,
    userId: run.startedByUserId,
  });
  if (!access) {
    throw new PermanentTaskRunError(
      'The user who started the run no longer has access to this workspace.',
    );
  }
  return run.startedByUserId;
}

/**
 * Checks today's state against what the approved version needs: its model, every granted tool and
 * the connection behind each integration tool. A run never goes on with fewer tools than approved.
 */
export async function assertApprovedConfigIsRunnable({
  versionConfig,
  userId,
}: {
  versionConfig: AgentVersionConfig;
  userId: string;
}): Promise<void> {
  const model = await getAiModelById({ aiModelId: versionConfig.aiModelId });
  if (!model) {
    throw new PermanentTaskRunError(`The agent's model no longer exists. ${APPROVE_AGAIN_HINT}`);
  }

  for (const storedGrant of versionConfig.toolGrants) {
    const grant = agentToolGrantSchema.safeParse(storedGrant);
    const inCatalog =
      grant.success && AGENT_TOOL_CATALOG.some((entry) => entry.id === grant.data.id);
    if (!grant.success || !inCatalog) {
      throw new PermanentTaskRunError(
        `The tool "${storedGrant.id}" is no longer available. ${APPROVE_AGAIN_HINT}`,
      );
    }

    const integration = findIntegration(grant.data.id);
    if (!integration) continue;
    const connection = await getUserConnectionByProvider({
      userId,
      provider: integration.provider,
    });
    if (!connection) {
      throw new PermanentTaskRunError(
        `The connection for "${integration.id}" no longer exists. Reconnect it, then approve the agent again.`,
      );
    }
  }
}

/** Names of the tools that change data: the granted write tools plus the run's own. */
export function listWriteToolNames({
  versionConfig,
  agentId,
  workspaceId,
  runToolDefinitions,
}: {
  versionConfig: AgentVersionConfig;
  agentId: string;
  workspaceId: string;
  runToolDefinitions: readonly AnyToolDefinition[];
}): Set<string> {
  const definitions = [
    ...listGrantedToolDefinitions(versionConfig.toolGrants, {
      agentId,
      workspaceId,
      runsInWorker: true,
      inTaskRun: true,
    }),
    ...runToolDefinitions,
  ];
  return new Set(
    definitions.filter((definition) => definition.access === 'write').map((d) => d.name),
  );
}
