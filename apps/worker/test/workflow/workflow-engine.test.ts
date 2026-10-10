import { createAgent, createAiModel, db, getStepsByRunId } from '@repo/database';
import { WORKFLOW_RUN_JOB } from '@repo/queue';
import {
  languageModelGenerateMock,
  resetProviderMocks,
  scriptModelOutput,
  seedAuthenticatedUser,
  seedCreditAccount,
  truncateAllTables,
  type SeededAuthenticatedUser,
} from '@repo/testing';
import type { WorkflowDefinition } from '@repo/workflow';
import { beforeEach, describe, expect, test } from 'bun:test';
import { processWorkflowJob } from '../../src/processors/workflow.processor';
import { buildJob } from '../support/job';
import {
  agentNode,
  conditionNode,
  edge,
  seedPricedAgent,
  seedWorkflow,
  seedWorkflowRun,
  transformNode,
  triggerNode,
} from '../support/workflow-fixtures';

async function runDefinition(definition: WorkflowDefinition, input = 'hello') {
  const user = await seedAuthenticatedUser();
  const workflowId = await seedWorkflow({
    userId: user.userId,
    workspaceId: user.workspaceId,
    definition,
  });
  const run = await seedWorkflowRun({
    workflowId,
    triggeredByUserId: user.userId,
    definition,
    input,
  });
  return { user, run };
}

async function seedAgentRun(user: SeededAuthenticatedUser, agentId: string) {
  const definition: WorkflowDefinition = {
    nodes: [triggerNode(), agentNode('writer', agentId, 'go')],
    edges: [edge('trigger', 'writer')],
  };
  const workflowId = await seedWorkflow({
    userId: user.userId,
    workspaceId: user.workspaceId,
    definition,
  });
  return seedWorkflowRun({ workflowId, triggeredByUserId: user.userId, definition });
}

function processRun(runId: string) {
  return processWorkflowJob(buildJob({ name: WORKFLOW_RUN_JOB, data: { runId } }));
}

async function loadRun(runId: string) {
  const run = await db.query.workflowRun.findFirst({ where: { id: runId } });
  const steps = await getStepsByRunId({ runId });
  return { run, steps };
}

describe('workflow engine', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('trigger, transform and agent run to completed with the scripted model', async () => {
    const user = await seedAuthenticatedUser();
    const agentId = await seedPricedAgent({ userId: user.userId, workspaceId: user.workspaceId });
    const definition: WorkflowDefinition = {
      nodes: [
        triggerNode(),
        transformNode('shout', 'INPUT: {{input}}'),
        agentNode('writer', agentId, 'Summarize {{input}}'),
      ],
      edges: [edge('trigger', 'shout'), edge('shout', 'writer')],
    };
    const workflowId = await seedWorkflow({
      userId: user.userId,
      workspaceId: user.workspaceId,
      definition,
    });
    const run = await seedWorkflowRun({
      workflowId,
      triggeredByUserId: user.userId,
      definition,
      input: 'hello',
    });
    scriptModelOutput({ text: 'the summary' });

    await processRun(run.id);

    const stored = await loadRun(run.id);
    expect(stored.run?.status).toBe('completed');
    expect(stored.run?.output).toBe('the summary');
    expect(stored.run?.startedAt).not.toBeNull();
    expect(stored.steps.map((step) => [step.nodeId, step.status]).sort()).toEqual([
      ['shout', 'completed'],
      ['trigger', 'completed'],
      ['writer', 'completed'],
    ]);
    const prompt = JSON.stringify(languageModelGenerateMock.mock.calls);
    expect(prompt).toContain('Summarize INPUT: hello');
  });

  test('a condition skips the untaken branch', async () => {
    const definition: WorkflowDefinition = {
      nodes: [
        triggerNode(),
        conditionNode('is-hello', '{{input}}', 'hello'),
        transformNode('yes', 'matched'),
        transformNode('no', 'not matched'),
      ],
      edges: [
        edge('trigger', 'is-hello'),
        edge('is-hello', 'yes', 'true'),
        edge('is-hello', 'no', 'false'),
      ],
    };
    const { run } = await runDefinition(definition, 'hello');

    await processRun(run.id);

    const stored = await loadRun(run.id);
    const statusByNode = Object.fromEntries(stored.steps.map((step) => [step.nodeId, step.status]));
    expect(stored.run?.status).toBe('completed');
    expect(statusByNode).toEqual({
      trigger: 'completed',
      'is-hello': 'completed',
      yes: 'completed',
      no: 'skipped',
    });
    expect(stored.run?.output).toBe('matched');
  });

  test('several terminal nodes produce a JSON output keyed by node id', async () => {
    const definition: WorkflowDefinition = {
      nodes: [triggerNode(), transformNode('a', 'A'), transformNode('b', 'B')],
      edges: [edge('trigger', 'a'), edge('trigger', 'b')],
    };
    const { run } = await runDefinition(definition);

    await processRun(run.id);

    const stored = await loadRun(run.id);
    expect(JSON.parse(stored.run?.output ?? '')).toEqual({ a: 'A', b: 'B' });
  });

  test('an agent node without credits fails the step with an insufficient credits error', async () => {
    const user = await seedAuthenticatedUser();
    const agentId = await seedPricedAgent({
      userId: user.userId,
      workspaceId: user.workspaceId,
      funded: false,
    });
    await seedCreditAccount({ userId: user.userId });
    const run = await seedAgentRun(user, agentId);

    await expect(processRun(run.id)).rejects.toThrow('Insufficient credits');

    const stored = await loadRun(run.id);
    const writerStep = stored.steps.find((step) => step.nodeId === 'writer');
    expect(writerStep?.status).toBe('failed');
    expect(writerStep?.error).toContain('Insufficient credits');
    expect(languageModelGenerateMock).not.toHaveBeenCalled();
  });

  test('an unpriced model is refused as not chargeable', async () => {
    const user = await seedAuthenticatedUser();
    await seedCreditAccount({ userId: user.userId, balanceMicroCredits: 10_000_000n });
    const unpricedModel = await createAiModel({
      provider: 'anthropic',
      model: 'unpriced-model',
      modality: 'text',
      family: 'llm',
      size: 'small',
      displayName: 'Unpriced',
      description: 'No pricing',
      pricing: null,
      capabilities: {},
      meta: {},
    });
    const agent = await createAgent({
      userId: user.userId,
      workspaceId: user.workspaceId,
      aiModelId: unpricedModel.id,
      name: 'Unpriced',
      description: null,
      systemPrompt: 'Write.',
      isDefault: false,
      tools: [],
    });
    const run = await seedAgentRun(user, agent.id);

    await expect(processRun(run.id)).rejects.toThrow('Model is not chargeable');

    expect(languageModelGenerateMock).not.toHaveBeenCalled();
  });

  test('a retry reuses completed steps instead of re-running them', async () => {
    const user = await seedAuthenticatedUser();
    const agentId = await seedPricedAgent({ userId: user.userId, workspaceId: user.workspaceId });
    const run = await seedAgentRun(user, agentId);
    languageModelGenerateMock.mockImplementationOnce(() => Promise.reject(new Error('flaky')));

    await expect(
      processWorkflowJob(
        buildJob({ name: WORKFLOW_RUN_JOB, data: { runId: run.id }, attempts: 2, attemptsMade: 0 }),
      ),
    ).rejects.toThrow('flaky');
    await processRun(run.id);

    const stored = await loadRun(run.id);
    expect(stored.run?.status).toBe('completed');
    expect(languageModelGenerateMock).toHaveBeenCalledTimes(2);
  });
});
