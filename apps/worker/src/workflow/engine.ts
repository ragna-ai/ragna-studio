import {
  getRunForExecution,
  getRunStatus,
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

  if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
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
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

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

      // Re-check for a mid-flight cancel before starting the next node. Stop
      // without overwriting the 'cancelled' status set by the cancel endpoint.
      if ((await getRunStatus({ runId })) === 'cancelled') {
        logger.info(`Workflow run ${runId} was cancelled, stopping execution`);
        return;
      }

      await runNode({ runId, run, node, nodeById, incomingEdgesByTarget, nodeState, outputs });
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
  nodeById,
  incomingEdgesByTarget,
  nodeState,
  outputs,
}: {
  runId: string;
  run: NonNullable<Awaited<ReturnType<typeof getRunForExecution>>>;
  node: WorkflowNode;
  nodeById: Map<string, WorkflowNode>;
  incomingEdgesByTarget: Map<string, WorkflowEdge[]>;
  nodeState: Map<string, NodeState>;
  outputs: Map<string, string>;
}): Promise<void> {
  const ctx: ExecutorContext = {
    input: resolveNodeInput({ node, nodeById, incomingEdgesByTarget, nodeState, outputs, run }),
    userId: run.workflow.userId,
  };

  await upsertRunStep({
    runId,
    nodeId: node.id,
    status: 'running',
    input: ctx.input,
    startedAt: new Date(),
  });

  try {
    const result = await nodeExecutors[node.type](node, ctx);

    await upsertRunStep({
      runId,
      nodeId: node.id,
      status: 'completed',
      output: result.output,
      toolCalls: result.toolCalls,
      finishedAt: new Date(),
    });

    outputs.set(node.id, result.output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const finishedAt = new Date();

    // Only the step is marked failed here. The run itself stays 'running' so
    // a BullMQ retry can resume it (completed/skipped steps are reused
    // idempotently, this step gets retried). The processor marks the run
    // 'failed' if this turns out to be the job's last attempt.
    await upsertRunStep({ runId, nodeId: node.id, status: 'failed', error: message, finishedAt });

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

// A node's input is its upstream node(s)' output(s), joined with a blank
// line ({{input}} resolves to this). The trigger has no incoming edges, so
// it falls back to the run input; that's also the correct value for the
// trigger's own output, which is what the first real node then receives.
function resolveNodeInput({
  node,
  nodeById,
  incomingEdgesByTarget,
  nodeState,
  outputs,
  run,
}: {
  node: WorkflowNode;
  nodeById: Map<string, WorkflowNode>;
  incomingEdgesByTarget: Map<string, WorkflowEdge[]>;
  nodeState: Map<string, NodeState>;
  outputs: Map<string, string>;
  run: NonNullable<Awaited<ReturnType<typeof getRunForExecution>>>;
}): string {
  const delivered = collectDeliveredOutputs({
    nodeId: node.id,
    nodeById,
    incomingEdgesByTarget,
    nodeState,
    outputs,
  });
  return delivered.length > 0 ? delivered.join('\n\n') : (run.input ?? '');
}

// Walks a node's delivering incoming edges and collects the source outputs.
// A condition node's own output is just the 'true'/'false' branch token,
// which is useless as chained content, so condition sources are looked
// through recursively to their own delivering upstream outputs instead.
function collectDeliveredOutputs({
  nodeId,
  nodeById,
  incomingEdgesByTarget,
  nodeState,
  outputs,
}: {
  nodeId: string;
  nodeById: Map<string, WorkflowNode>;
  incomingEdgesByTarget: Map<string, WorkflowEdge[]>;
  nodeState: Map<string, NodeState>;
  outputs: Map<string, string>;
}): string[] {
  const incoming = incomingEdgesByTarget.get(nodeId) ?? [];
  const delivered: string[] = [];

  for (const edge of incoming) {
    if (!edgeDelivers(edge, nodeState, outputs)) {
      continue;
    }

    const sourceNode = nodeById.get(edge.source);
    if (sourceNode?.type === 'condition') {
      delivered.push(
        ...collectDeliveredOutputs({
          nodeId: edge.source,
          nodeById,
          incomingEdgesByTarget,
          nodeState,
          outputs,
        }),
      );
      continue;
    }

    delivered.push(outputs.get(edge.source) ?? '');
  }

  return delivered;
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
