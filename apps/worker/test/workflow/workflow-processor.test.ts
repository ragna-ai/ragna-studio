import { db, getRunStatus, updateRunStatus } from '@repo/database';
import { NOTIFY_USER_JOB, WORKFLOW_RUN_JOB } from '@repo/queue';
import {
  languageModelGenerateMock,
  enqueuedJobs,
  queueAddMock,
  resetProviderMocks,
  seedAuthenticatedUser,
  truncateAllTables,
  type SeededAuthenticatedUser,
} from '@repo/testing';
import type { WorkflowDefinition } from '@repo/workflow';
import { beforeEach, describe, expect, test } from 'bun:test';
import { processWorkflowJob } from '../../src/processors/workflow.processor';
import { buildJob } from '../support/job';
import {
  agentNode,
  edge,
  seedPricedAgent,
  seedWorkflow,
  seedWorkflowRun,
  triggerNode,
} from '../support/workflow-fixtures';

const MISSING_AGENT_DEFINITION: WorkflowDefinition = {
  nodes: [triggerNode(), agentNode('writer', 'missing-agent', 'Write a report')],
  edges: [edge('trigger', 'writer')],
};

function runJob(runId: string, attempts = 1, attemptsMade = 0) {
  return buildJob({ name: WORKFLOW_RUN_JOB, data: { runId }, attempts, attemptsMade });
}

function notificationTypes(): string[] {
  return queueAddMock.mock.calls
    .filter(([jobName]) => jobName === NOTIFY_USER_JOB)
    .map(([, data]) => (data as { type: string }).type);
}

interface SeedRunParams {
  owner: SeededAuthenticatedUser;
  triggeredByUserId?: string | null;
  definition?: WorkflowDefinition;
}

async function seedRun({ owner, triggeredByUserId, definition }: SeedRunParams) {
  const workflowId = await seedWorkflow({
    userId: owner.userId,
    workspaceId: owner.workspaceId,
    definition,
  });
  return seedWorkflowRun({
    workflowId,
    triggeredByUserId: triggeredByUserId === undefined ? owner.userId : triggeredByUserId,
    definition,
  });
}

describe('processWorkflowJob', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('success completes the run and enqueues workflow_run_succeeded', async () => {
    const user = await seedAuthenticatedUser();
    const run = await seedRun({ owner: user });

    const result = await processWorkflowJob(runJob(run.id));

    expect(result).toEqual({ success: true });
    expect(await getRunStatus({ runId: run.id })).toBe('completed');
    expect(notificationTypes()).toEqual(['workflow_run_succeeded']);
    const notification = queueAddMock.mock.calls.find(([name]) => name === NOTIFY_USER_JOB);
    expect(notification?.[1]).toEqual({
      userId: user.userId,
      type: 'workflow_run_succeeded',
      data: {
        workflowId: run.workflowId,
        runId: run.id,
        workflowName: 'Nightly report',
        workspaceId: user.workspaceId,
      },
    });
  });

  test('final-attempt failure marks the run failed and enqueues workflow_run_failed', async () => {
    const user = await seedAuthenticatedUser();
    const run = await seedRun({ owner: user, definition: MISSING_AGENT_DEFINITION });

    await expect(processWorkflowJob(runJob(run.id, 3, 2))).rejects.toThrow();
    const stored = await db.query.workflowRun.findFirst({ where: { id: run.id } });
    expect(stored?.status).toBe('failed');
    expect(stored?.error).toContain('Agent "missing-agent" not found');
    expect(stored?.finishedAt).not.toBeNull();
    expect(notificationTypes()).toContain('workflow_run_failed');
  });

  test('non-final failure leaves the run running and sends nothing', async () => {
    const user = await seedAuthenticatedUser();
    const run = await seedRun({ owner: user, definition: MISSING_AGENT_DEFINITION });

    await expect(processWorkflowJob(runJob(run.id, 3, 0))).rejects.toThrow();

    expect(await getRunStatus({ runId: run.id })).toBe('running');
    expect(enqueuedJobs(NOTIFY_USER_JOB)).toHaveLength(0);
  });

  test('a cancelled run stays cancelled and sends no notification', async () => {
    const user = await seedAuthenticatedUser();
    const run = await seedRun({ owner: user });
    await updateRunStatus({ runId: run.id, status: 'cancelled', finishedAt: new Date() });

    const result = await processWorkflowJob(runJob(run.id, 1, 0));

    expect(result).toEqual({ success: true });
    expect(await getRunStatus({ runId: run.id })).toBe('cancelled');
    expect(enqueuedJobs(NOTIFY_USER_JOB)).toHaveLength(0);
  });

  test('a final-attempt failure does not overwrite a run cancelled meanwhile', async () => {
    const user = await seedAuthenticatedUser();
    const agentId = await seedPricedAgent({ userId: user.userId, workspaceId: user.workspaceId });
    const definition: WorkflowDefinition = {
      nodes: [triggerNode(), agentNode('writer', agentId, 'one')],
      edges: [edge('trigger', 'writer')],
    };
    const run = await seedRun({ owner: user, definition });
    languageModelGenerateMock.mockImplementationOnce(async () => {
      await updateRunStatus({ runId: run.id, status: 'cancelled', finishedAt: new Date() });
      throw new Error('model exploded');
    });

    await expect(processWorkflowJob(runJob(run.id))).rejects.toThrow('model exploded');

    expect(await getRunStatus({ runId: run.id })).toBe('cancelled');
    expect(enqueuedJobs(NOTIFY_USER_JOB)).toHaveLength(0);
  });

  test('a run with no user fails without a notification', async () => {
    const owner = await seedAuthenticatedUser();
    const run = await seedRun({ owner, triggeredByUserId: null });

    const result = await processWorkflowJob(runJob(run.id));

    const stored = await db.query.workflowRun.findFirst({ where: { id: run.id } });
    expect(result).toEqual({ success: true });
    expect(stored?.status).toBe('failed');
    expect(stored?.error).toBe('Workflow run has no user to run as');
    expect(enqueuedJobs(NOTIFY_USER_JOB)).toHaveLength(0);
  });

  test('cancelling mid-flight stops the engine before the next node', async () => {
    const user = await seedAuthenticatedUser();
    const agentId = await seedPricedAgent({ userId: user.userId, workspaceId: user.workspaceId });
    const definition: WorkflowDefinition = {
      nodes: [
        triggerNode(),
        agentNode('first', agentId, 'one'),
        agentNode('second', agentId, 'two'),
      ],
      edges: [edge('trigger', 'first'), edge('first', 'second')],
    };
    const run = await seedRun({ owner: user, definition });
    const defaultGenerate = languageModelGenerateMock.getMockImplementation();
    languageModelGenerateMock.mockImplementationOnce(async () => {
      await updateRunStatus({ runId: run.id, status: 'cancelled', finishedAt: new Date() });
      if (!defaultGenerate) {
        throw new Error('default language mock implementation missing');
      }
      return defaultGenerate();
    });

    await processWorkflowJob(runJob(run.id));

    expect(languageModelGenerateMock).toHaveBeenCalledTimes(1);
    expect(await getRunStatus({ runId: run.id })).toBe('cancelled');
    expect(enqueuedJobs(NOTIFY_USER_JOB)).toHaveLength(0);
  });

  test('a notification enqueue failure does not fail the job', async () => {
    const user = await seedAuthenticatedUser();
    const run = await seedRun({ owner: user });
    queueAddMock.mockImplementationOnce(() => Promise.reject(new Error('redis down')));

    const result = await processWorkflowJob(runJob(run.id));

    expect(result).toEqual({ success: true });
    expect(await getRunStatus({ runId: run.id })).toBe('completed');
  });

  test('unknown job name throws', async () => {
    await expect(processWorkflowJob(buildJob({ name: 'nope', data: {} }))).rejects.toThrow(
      'Unknown workflow job: nope',
    );
  });

  test('a run that does not exist throws', async () => {
    await expect(processWorkflowJob(runJob(Bun.randomUUIDv7()))).rejects.toThrow('not found');
  });
});
