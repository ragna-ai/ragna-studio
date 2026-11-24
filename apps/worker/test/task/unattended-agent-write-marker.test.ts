import { getMemoryByAgentId, getTaskRunWithContext } from '@repo/database';
import {
  languageModelGenerateMock,
  resetProviderMocks,
  scriptModelOutput,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { runAgentUnattended } from '../../src/agents/unattended-agent';
import { seedQueuedTaskRun } from '../support/task-run-fixtures';

const MEMORY_CALL = { toolName: 'memory', input: { action: 'append', text: 'a fact' } };

async function runWithMemory(onBeforeWrite: (agentId: string) => Promise<void>) {
  const seeded = await seedQueuedTaskRun({ toolGrants: [{ id: 'memory' }] });
  const run = await getTaskRunWithContext({ taskRunId: seeded.runId });
  if (!run) throw new Error('Run not found');
  const outcome = runAgentUnattended({
    agentId: seeded.agentId,
    workspaceId: seeded.workspaceId,
    userId: seeded.user.userId,
    config: run.agentVersion.config,
    prompt: 'go',
    charge: {
      feature: 'task',
      refType: 'taskRun',
      refId: seeded.runId,
      idempotencyKey: `task:${seeded.runId}:1`,
    },
    maxSteps: 5,
    writeToolNames: new Set(['memory']),
    onBeforeWrite: () => onBeforeWrite(seeded.agentId),
    logLabel: 'test',
  });
  return { seeded, outcome };
}

describe('write marker', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('is saved before the write tool runs', async () => {
    scriptModelOutput({ toolCalls: [MEMORY_CALL] });
    let memoryWhenMarked: unknown = 'not checked';
    const { seeded, outcome } = await runWithMemory(async (agentId) => {
      memoryWhenMarked = await getMemoryByAgentId({ agentId });
    });

    await outcome;

    expect(memoryWhenMarked).toBeNull();
    expect((await getMemoryByAgentId({ agentId: seeded.agentId }))?.content).toContain('a fact');
  });

  test('stops the run and never runs the tool when the marker cannot be saved', async () => {
    scriptModelOutput({ toolCalls: [MEMORY_CALL] });
    scriptModelOutput({ text: 'carrying on' });
    const { seeded, outcome } = await runWithMemory(async () => {
      throw new Error('database unavailable');
    });

    await expect(outcome).rejects.toThrow('database unavailable');

    expect(await getMemoryByAgentId({ agentId: seeded.agentId })).toBeNull();
    expect(languageModelGenerateMock).toHaveBeenCalledTimes(1);
  });
});
