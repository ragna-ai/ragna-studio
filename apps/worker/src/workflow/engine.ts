import {
  getRunForExecution,
  getStepsByRunId,
  updateRunStatus,
  upsertRunStep,
} from '@repo/database';
import { logger } from '@repo/logger';
import type { WorkflowEdge, WorkflowNode } from '@repo/workflow';
import type { ExecutorContext } from './executors';
import { nodeExecutors } from './executors';

type NodeState = 'done' | 'skipped';

export async function executeWorkflowRun({ runId }: { runId: string }): Promise<void> {
  const run = await getRunForExecution({ runId });

  if (!run) {
    throw new Error(`Workflow run "${runId}" not found`);
  }

  if (run.status === 'completed' || run.status === 'failed') {
    logger.info(`Workflow run ${runId} is already ${run.status}, ignoring stale retry`);
    return;
  }

  await updateRunStatus({
    runId,
    status: 'running',
    startedAt: run.startedAt ?? new Date(),
  });

  const { nodes, edges } = run.definition;
  const incomingEdgesByTarget = groupIncomingEdges(nodes, edges);

  // Idempotent retry: completed/skipped steps from a previous attempt are
  // reused instead of re-executed.
  const nodeState = new Map<string, NodeState>();
  const outputs = new Map<string, string>();
  for (const step of await getStepsByRunId({ runId })) {
    if (step.status === 'completed') {
      nodeState.set(step.nodeId, 'done');
      outputs.set(step.nodeId, step.output ?? '');
    } else if (step.status === 'skipped') {
      nodeState.set(step.nodeId, 'skipped');
    }
  }

  // Walk the DAG breadth-first-ish: repeat passes over the node list until a
  // pass makes no progress. Each node runs once it and its dependencies are
  // resolved, so this converges in at most `nodes.length` passes.
  let progressed = true;
  while (progressed) {
    progressed = false;

    for (const node of nodes) {
      if (nodeState.has(node.id)) {
        continue;
      }

      const incoming = incomingEdgesByTarget.get(node.id) ?? [];
      const isReady = incoming.every((edge) => nodeState.has(edge.source));
      if (!isReady) {
        continue;
      }

      const delivered = incoming.some((edge) => edgeDelivers(edge, nodeState, outputs));
      if (incoming.length > 0 && !delivered) {
        await upsertRunStep({ runId, nodeId: node.id, status: 'skipped' });
        nodeState.set(node.id, 'skipped');
        progressed = true;
        continue;
      }

      await runNode({ runId, run, node, outputs });
      nodeState.set(node.id, 'done');
      progressed = true;
    }
  }

  const unresolved = nodes.filter((node) => !nodeState.has(node.id));
  if (unresolved.length > 0) {
    const ids = unresolved.map((node) => node.id).join(', ');
    throw new Error(`Workflow run ${runId} deadlocked, nodes never resolved: ${ids}`);
  }

  const terminalNodes = nodes.filter(
    (node) => nodeState.get(node.id) === 'done' && !edges.some((edge) => edge.source === node.id),
  );

  await updateRunStatus({
    runId,
    status: 'completed',
    output: buildRunOutput(terminalNodes, outputs),
    finishedAt: new Date(),
  });
}

async function runNode({
  runId,
  run,
  node,
  outputs,
}: {
  runId: string;
  run: NonNullable<Awaited<ReturnType<typeof getRunForExecution>>>;
  node: WorkflowNode;
  outputs: Map<string, string>;
}): Promise<void> {
  const ctx: ExecutorContext = {
    input: run.input ?? '',
    nodes: Object.fromEntries(outputs),
    userId: run.workflow.userId,
  };

  await upsertRunStep({
    runId,
    nodeId: node.id,
    status: 'running',
    input: JSON.stringify({ input: ctx.input, nodes: ctx.nodes }),
    startedAt: new Date(),
  });

  try {
    const output = await nodeExecutors[node.type](node, ctx);

    await upsertRunStep({
      runId,
      nodeId: node.id,
      status: 'completed',
      output,
      finishedAt: new Date(),
    });

    outputs.set(node.id, output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const finishedAt = new Date();

    await upsertRunStep({ runId, nodeId: node.id, status: 'failed', error: message, finishedAt });
    await updateRunStatus({ runId, status: 'failed', error: message, finishedAt });

    throw error;
  }
}

function groupIncomingEdges(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): Map<string, WorkflowEdge[]> {
  const incoming = new Map<string, WorkflowEdge[]>(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    incoming.get(edge.target)?.push(edge);
  }
  return incoming;
}

// An edge delivers when its source completed (not merely skipped) and,
// for condition branches, the source's 'true'/'false' output matches the
// edge's sourceHandle.
function edgeDelivers(
  edge: WorkflowEdge,
  nodeState: Map<string, NodeState>,
  outputs: Map<string, string>,
): boolean {
  if (nodeState.get(edge.source) !== 'done') {
    return false;
  }
  if (edge.sourceHandle === undefined) {
    return true;
  }
  return outputs.get(edge.source) === edge.sourceHandle;
}

function buildRunOutput(terminalNodes: WorkflowNode[], outputs: Map<string, string>): string {
  if (terminalNodes.length === 0) {
    return '';
  }
  if (terminalNodes.length === 1) {
    return outputs.get(terminalNodes[0]!.id) ?? '';
  }
  return JSON.stringify(
    Object.fromEntries(terminalNodes.map((node) => [node.id, outputs.get(node.id) ?? ''])),
  );
}
