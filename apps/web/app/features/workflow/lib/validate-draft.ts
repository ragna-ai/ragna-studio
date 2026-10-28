import {
  getNodeAgentReferences,
  validateWorkflowDefinition,
  workflowDefinitionSchema,
  type WorkflowDefinition,
} from '@repo/workflow';
import type {
  WorkflowBlockingMessage,
  WorkflowDraftValidation,
  WorkflowFieldIssue,
} from '~/features/workflow/types/validation';

const FIELD_MESSAGE_KEYS: Record<string, string> = {
  agentId: 'workflow.validation.agentRequired',
  leadAgentId: 'workflow.validation.leadAgentRequired',
  prompt: 'workflow.validation.promptRequired',
  cron: 'workflow.validation.cronInvalid',
  timezone: 'workflow.validation.timezoneInvalid',
};
const MEMBER_AGENT_FIELD = /^members\.\d+\.agentId$/;
const MEMBER_AGENT_MESSAGE_KEY = 'workflow.validation.memberAgentRequired';
const AGENT_DELETED_MESSAGE_KEY = 'workflow.validation.agentDeleted';
const NODE_INVALID_MESSAGE_KEY = 'workflow.validation.nodeInvalid';
const DEFINITION_INVALID_MESSAGE_KEY = 'workflow.validation.definitionInvalid';

type NodeIssues = Map<string, WorkflowFieldIssue[]>;

interface ShapeIssues {
  nodeIssues: NodeIssues;
  definitionIssues: WorkflowFieldIssue[];
}

function getShapeMessageKey(field: string): string {
  if (MEMBER_AGENT_FIELD.test(field)) {
    return MEMBER_AGENT_MESSAGE_KEY;
  }
  return FIELD_MESSAGE_KEYS[field] ?? NODE_INVALID_MESSAGE_KEY;
}

function addNodeIssue(
  nodeIssues: NodeIssues,
  nodeId: string,
  issue: WorkflowFieldIssue,
) {
  const issues = nodeIssues.get(nodeId) ?? [];
  if (issues.some((existing) => existing.field === issue.field)) {
    return;
  }
  issues.push(issue);
  nodeIssues.set(nodeId, issues);
}

function collectShapeIssues(definition: WorkflowDefinition): ShapeIssues {
  const shapeIssues: ShapeIssues = {
    nodeIssues: new Map(),
    definitionIssues: [],
  };
  const parsed = workflowDefinitionSchema.safeParse(definition);
  if (parsed.success) {
    return shapeIssues;
  }

  for (const issue of parsed.error.issues) {
    const [root, nodeIndex, data, config, ...fieldPath] = issue.path;
    const node =
      root === 'nodes' && typeof nodeIndex === 'number'
        ? definition.nodes[nodeIndex]
        : undefined;
    if (!node) {
      if (shapeIssues.definitionIssues.length === 0) {
        shapeIssues.definitionIssues.push({
          field: '',
          messageKey: DEFINITION_INVALID_MESSAGE_KEY,
        });
      }
      continue;
    }
    const field =
      data === 'data' && config === 'config'
        ? fieldPath.map(String).join('.')
        : '';
    addNodeIssue(shapeIssues.nodeIssues, node.id, {
      field,
      messageKey: getShapeMessageKey(field),
    });
  }
  return shapeIssues;
}

function collectReferenceIssues(
  definition: WorkflowDefinition,
  knownAgentIds: ReadonlySet<string>,
  nodeIssues: NodeIssues,
) {
  for (const node of definition.nodes) {
    if (nodeIssues.has(node.id)) {
      continue;
    }
    for (const { path, agentId } of getNodeAgentReferences(node)) {
      if (!agentId || knownAgentIds.has(agentId)) {
        continue;
      }
      addNodeIssue(nodeIssues, node.id, {
        field: path.join('.'),
        messageKey: AGENT_DELETED_MESSAGE_KEY,
      });
    }
  }
}

/**
 * Checks the draft the way the API will: shape, agent references, then graph.
 * Pass `null` as `knownAgentIds` while the agent list is loading or incomplete
 * to skip the reference layer.
 */
export function validateDraft(
  definition: WorkflowDefinition,
  knownAgentIds: ReadonlySet<string> | null,
): WorkflowDraftValidation {
  const { nodeIssues, definitionIssues } = collectShapeIssues(definition);
  if (knownAgentIds) {
    collectReferenceIssues(definition, knownAgentIds, nodeIssues);
  }

  const graphResult = validateWorkflowDefinition(definition);
  const graphIssues = graphResult.valid ? [] : graphResult.issues;

  const canSave = nodeIssues.size === 0 && definitionIssues.length === 0;
  return {
    nodeIssues,
    definitionIssues,
    graphIssues,
    canSave,
    canPublish: canSave && graphIssues.length === 0,
  };
}

export function findFieldIssue(
  validation: WorkflowDraftValidation | undefined,
  nodeId: string,
  field: string,
): WorkflowFieldIssue | undefined {
  return validation?.nodeIssues
    .get(nodeId)
    ?.find((issue) => issue.field === field);
}

export function getFirstInvalidNodeId(
  validation: WorkflowDraftValidation,
): string | undefined {
  return validation.nodeIssues.keys().next().value;
}

/** The single message explaining why Save/Publish is blocked; the translator pluralizes on `count`. */
export function getBlockingMessage(
  validation: WorkflowDraftValidation,
): WorkflowBlockingMessage {
  if (validation.nodeIssues.size > 0) {
    return {
      messageKey: 'workflow.validation.nodesNeedAttention',
      count: validation.nodeIssues.size,
    };
  }
  const [graphIssue] = validation.graphIssues;
  if (validation.definitionIssues.length > 0 || !graphIssue) {
    return { messageKey: DEFINITION_INVALID_MESSAGE_KEY, count: 1 };
  }
  return {
    messageKey: `workflow.validation.graph.${graphIssue.code}`,
    count: 1,
  };
}
