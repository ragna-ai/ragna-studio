import { db, getStepsByRunId } from '@repo/database';
import { WORKFLOW_RUN_JOB } from '@repo/queue';
import {
  DRIVE_CREATED_FILE_ID,
  DRIVE_FOLDER,
  GOOGLE_DRIVE_ENDPOINTS,
  resetProviderMocks,
  scriptModelOutput,
  seedAuthenticatedUser,
  seedGoogleDriveConnection,
  truncateAllTables,
  vendorRequestsTo,
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

const FILE_INPUT = {
  name: 'nightly-report.md',
  folderId: DRIVE_FOLDER.id,
  format: 'markdown',
  content: '# Nightly report\n\nAll green.',
};

describe('cloud drive writes in an unattended run', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  test('a read and write agent creates the file without approval and the trace names it', async () => {
    const user = await seedAuthenticatedUser();
    await seedGoogleDriveConnection({ userId: user.userId });
    const agentId = await seedPricedAgent({
      userId: user.userId,
      workspaceId: user.workspaceId,
      toolGrants: [{ id: 'google-drive', access: 'write' }],
    });
    const definition: WorkflowDefinition = {
      nodes: [triggerNode(), agentNode('writer', agentId, 'Write the report')],
      edges: [edge('trigger', 'writer')],
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
    });
    scriptModelOutput({ toolCalls: [{ toolName: 'googleDriveCreateFile', input: FILE_INPUT }] });
    scriptModelOutput({ text: 'Report saved.' });

    await processWorkflowJob(buildJob({ name: WORKFLOW_RUN_JOB, data: { runId: run.id } }));

    const [upload] = vendorRequestsTo(GOOGLE_DRIVE_ENDPOINTS.create);
    expect(upload?.body).toContain(FILE_INPUT.name);
    expect(upload?.body).toContain(FILE_INPUT.content);
    const stored = await db.query.workflowRun.findFirst({ where: { id: run.id } });
    expect(stored?.status).toBe('completed');
    const steps = await getStepsByRunId({ runId: run.id });
    const writerTrace = steps.find((step) => step.nodeId === 'writer')?.trace ?? [];
    const toolCall = writerTrace.flatMap((entry) => entry.toolCalls).at(0);
    expect(toolCall?.toolName).toBe('googleDriveCreateFile');
    expect(toolCall?.output).toMatchObject({
      status: 'ok',
      id: DRIVE_CREATED_FILE_ID,
      name: FILE_INPUT.name,
    });
  });

  test('a read agent is not offered the write tool, so nothing is uploaded', async () => {
    const user = await seedAuthenticatedUser();
    await seedGoogleDriveConnection({ userId: user.userId });
    const agentId = await seedPricedAgent({
      userId: user.userId,
      workspaceId: user.workspaceId,
      toolGrants: [{ id: 'google-drive', access: 'read' }],
    });
    const definition: WorkflowDefinition = {
      nodes: [triggerNode(), agentNode('writer', agentId, 'Write the report')],
      edges: [edge('trigger', 'writer')],
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
    });
    scriptModelOutput({ toolCalls: [{ toolName: 'googleDriveCreateFile', input: FILE_INPUT }] });
    scriptModelOutput({ text: 'Could not save.' });

    await processWorkflowJob(buildJob({ name: WORKFLOW_RUN_JOB, data: { runId: run.id } }));

    expect(vendorRequestsTo(GOOGLE_DRIVE_ENDPOINTS.create)).toHaveLength(0);
  });
});
