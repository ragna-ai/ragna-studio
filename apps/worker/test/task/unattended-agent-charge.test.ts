import { db } from '@repo/database';
import {
  languageModelGenerateMock,
  resetProviderMocks,
  scriptModelOutput,
  seedAuthenticatedUser,
  truncateAllTables,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { runReferencedAgent } from '../../src/workflow/executors/run-referenced-agent';
import { seedPricedAgent } from '../support/workflow-fixtures';

describe('workflow agent charge', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('still pays for the tokens of a step that ran before the run threw', async () => {
    const user = await seedAuthenticatedUser();
    const agentId = await seedPricedAgent({
      userId: user.userId,
      workspaceId: user.workspaceId,
      toolGrants: [{ id: 'memory' }],
    });
    scriptModelOutput({
      toolCalls: [{ toolName: 'memory', input: { action: 'append', text: 'fact' } }],
    });
    const original = languageModelGenerateMock.getMockImplementation();
    if (!original) throw new Error('Expected a default language model implementation');
    languageModelGenerateMock.mockImplementationOnce(original).mockImplementationOnce(async () => {
      throw new Error('provider exploded');
    });

    const run = runReferencedAgent({
      agentId,
      userId: user.userId,
      workspaceId: user.workspaceId,
      prompt: 'go',
      runId: 'run-1',
      nodeId: 'writer',
      callId: 'agent',
      feature: 'workflow',
    });
    await expect(run).rejects.toThrow();

    const events = await db.query.creditUsageEvent.findMany({
      where: { workspaceId: user.workspaceId },
    });
    expect(events).toHaveLength(1);
    const ledger = await db.query.creditLedger.findMany({
      where: { idempotencyKey: 'workflow:run-1:writer:agent' },
    });
    expect(ledger).toHaveLength(1);
  });
});
